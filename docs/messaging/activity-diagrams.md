# Connect (Messaging & Calls) — Activity / Flow Diagrams

Mermaid flow diagrams for the messaging domain. Render natively in GitHub/VSCode. Actor lanes are
subgraphs (Contact / Web / API / Worker / Twilio / OpenAI).

Pairs with [user-stories.md](./user-stories.md) and [`../feature-spec/connect-messaging.md`](../feature-spec/connect-messaging.md).

Index:
1. [Send / schedule a message](#1-send--schedule-a-message)
2. [Inbound SMS + auto-responder](#2-inbound-sms--auto-responder)
3. [Scheduled delivery (sender)](#3-scheduled-delivery-sender-queue)
4. [Inbound call → forward / voicemail](#4-inbound-call--forward--voicemail)
5. [Number provisioning](#5-number-provisioning)
6. [Conversation state machine](#6-conversation-state-machine)

---

## 1. Send / schedule a message

```mermaid
flowchart TD
    subgraph Operator
        A([Compose in inbox or /connect/new]) --> B[Pick recipients + text + media]
        B --> C{Schedule toggle?}
        C -- now --> D[Send]
        C -- later --> E[Pick date + timezone] --> D
    end
    subgraph API
        D --> F{Enough SMS credits?\n1 per recipient + per attachment}
        F -- no --> G[[Blocked: insufficient credits]]
        F -- yes --> H{scheduledAt set?}
        H -- yes --> I[Store message scheduled\n+ scheduleTimezone]
        H -- no --> J[Send via Twilio\nMessagingService if set]
        J --> K{Provider ok?}
        K -- no --> L[Refund credits]
        K -- yes --> M[Decrement credits\nappend outbound message]
    end
    I --> N[(messages: scheduled)]
    M --> O[(messages: sent)]
```

---

## 2. Inbound SMS + auto-responder

```mermaid
flowchart TD
    subgraph Contact
        A([Texts the Twilio number])
    end
    subgraph Twilio
        A --> B[POST /webhook/twilio/trigger]
    end
    subgraph API
        B --> V{Valid Twilio signature?}
        V -- no --> VX[[Reject - fix-on-rebuild: enable validation]]
        V -- yes --> C[Resolve profile by To number\nUS numbers only]
        C --> D[Match contact by masked phone\nelse actor = Unknown]
        D --> E[Append inbound message\n+ notify profile users]
        E --> F{Body = STOP / START?}
        F -- STOP --> G[Set unsubscribed = 1\nno auto-response]
        F -- START --> H[Set unsubscribed = 0]
        F -- other --> I{Auto-response enabled?}
        I -- no --> Z[Done]
        I -- yes --> J{Keyword match?\ncase-insensitive, or '*' }
        J -- no --> Z
        J -- yes --> K{Within schedule window?\nafter / between start-end}
        K -- no --> Z
        K -- yes --> L[Substitute placeholders\n+ send reply]
        L --> M{Cadences defined?}
        M -- yes --> N[Enqueue +N Days follow-ups]
        M -- no --> Z
    end
```

---

## 3. Scheduled delivery (sender queue)

```mermaid
flowchart TD
    A([Scheduled messages + cadence follow-ups]) --> B[sender queue polls due rows]
    B --> C[Resolve message.scheduleTimezone\n→ due time in that tz]
    C --> D{Now >= due?}
    D -- no --> E[Wait]
    D -- yes --> F{Credits ok?}
    F -- no --> G[Skip / notify]
    F -- yes --> H[Twilio send]
    H --> I[Append to thread + mark sent]
```

> Fix-on-rebuild: resolve the message's actual timezone, not the v1 hardcoded 5-zone Pacific map.

---

## 4. Inbound call → forward / voicemail

```mermaid
flowchart TD
    subgraph Contact
        A([Calls the Twilio number])
    end
    subgraph Twilio
        A --> B[POST /webhook/calls/twilio/:num/answer]
    end
    subgraph API[TwiML build]
        B --> C{VoiceMailActive && Timeout==0?}
        C -- yes --> D[Go straight to voicemail]
        C -- no --> E{Recording warning active?}
        E -- yes --> F[Play warning - Polly]
        E -- no --> G
        F --> G[Dial ForwardTo\ncaller-id passthrough, timeout,\nrecord-from-ringing]
        G --> H[POST status callback]
        H --> I{Dial completed?}
        I -- yes --> J[Save recording → audio]
        I -- no --> K[Record voicemail\nand/or send MissedCallText]
        D --> K
    end
    subgraph OpenAI
        J --> L[Transcribe → gpt-4 summary]
        K --> L
        L --> M[call_logs.Topic ≤254 chars]
    end
```

---

## 5. Number provisioning

```mermaid
flowchart TD
    A([Setup SMS account]) --> B[POST /sms-numbers/setup\ncreate Twilio subaccount idempotent]
    B --> C[Search by area code\nGET /sms-numbers/search US→CA]
    C --> D[Pick a number → Save]
    D --> E[Buy number]
    E --> F[Wire SMS webhook /webhook/twilio/trigger\n+ voice webhook /answer]
    F --> G[Create Messaging Service\nstore MessagingServiceId]
    G --> H[Seed twilio_verifications\nStatus 0, Step 1.1]
    H --> I[(profile SMS info set)]
    I -.release.-> J[DELETE /sms-numbers\nclose subaccount + reset]
```

---

## 6. Conversation state machine

```mermaid
stateDiagram-v2
    [*] --> Open: first inbound or outbound
    Open --> Open: message appended (in/out)
    Open --> Scheduled: outbound queued for later
    Scheduled --> Open: sender delivers
    Open --> Unsubscribed: contact texts STOP
    Unsubscribed --> Open: contact texts START
    Open --> Archived: archive
    Archived --> Open: unarchive (restore)
    Archived --> [*]

    note right of Unsubscribed
        auto-response suppressed;
        badge shown in inbox
    end note
```
</content>
