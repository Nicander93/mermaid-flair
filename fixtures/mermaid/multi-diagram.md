# Mermaid Flair regression note

## Request routing

```mermaid
flowchart LR
  A["入口 / API gateway"] --> B{Authenticated?}
  subgraph Processing
    B -->|yes| C["Validate & enqueue a request with a long description"]
    C --> D[(Queue)]
  end
  B -->|no| E["拒绝访问"]
  D --> F([Done])
```

## OAuth2

```mermaid
sequenceDiagram
  actor U as 用户
  participant C as Client
  participant A as Authorization Server
  participant R as Resource Server
  U->>C: Sign in
  C->>A: Authorize with PKCE challenge
  Note over U,A: Redirect and consent / 同意
  alt Consent granted
    A-->>C: Authorization code
    C->>A: Exchange code with verifier
    A-->>C: Access token
    loop While access token is valid
      C->>R: Request a protected resource
      R-->>C: JSON response
    end
  else Consent denied
    A-->>C: access_denied
  end
```

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Running
  Running --> Done
  Done --> [*]
```

## Class

```mermaid
classDiagram
  Document "1" *-- "*" Diagram
  class Diagram {
    +String source
    +render()
  }
```

## Entities

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
```

## Milestones

```mermaid
gantt
  title Release schedule
  dateFormat YYYY-MM-DD
  section Delivery
  Prototype :a, 2026-10-01, 3d
  Test :after a, 4d
```

## Invalid

```mermaid
flowchart LR
  A --> [
```

## Failure recovery

```mermaid
flowchart TD
  A[Start] --> B{Succeeded?}
  B -->|yes| C[Finish]
  B -->|no| D[Retry]
  D --> B
```

## Mind map

```mermaid
mindmap
  root((Mermaid Flair))
    Themes
      Minimal
      Modern
      Sketch
    Viewer
      Pan
      Zoom
```

## Distribution

```mermaid
pie showData
  "Desktop" : 76
  "Other" : 24
```

```text
This code fence is deliberately not a diagram.
```
