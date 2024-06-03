# Decentraland Entity Deployment Protocol

## Introduction

The deployment protocol is used for sending entities to the Content Server. The protocol is very simple and is designed to deploy one entity at a time. To accomplish that, it sends a multipart/form-data POST request to the Content Server including:

* The entity's content (its metadata).
* The entity id.
* All the files.
* The auth-chain signing the entity id.

This approach is quite simple, but it has some issues. For e.g., when deploying a big scene, it requires sending all the files in a single request. A scene can have many files and potentially contain 250 Mb.

First of all, all requests are proxied by Cloudflare. Then, depending on the type of storage used by the Content Server, it may require those uploaded files to be forwarded to a different storage system (like AWS S3). This new upload can only take place after all the files have been received, and makes the overall time to deploy a scene longer, potentially causing a timeout on the Cloudflare side.

```mermaid
sequenceDiagram
    participant Client
    participant Cloudflare
    participant Content Server
    participant Storage Server
    Client ->>+ Cloudflare: POST /entities
    Cloudflare ->>+ Content Server: proxy request
    Content Server ->> Content Server: Validate deployment
    Content Server ->>+ Storage Server: Store files
    Note right of Client: This can take to long<br>and timeout occur
    Cloudflare -->>- Client: timeout (504)
    Storage Server -->>- Content Server: ok
    Content Server -->>- Cloudflare: ok
```

## Proposal
A new approach is proposed to solve this issue. The idea is to split the deployment process into multiple steps:
* Initiate a deployment request.
* Upload all content files in parallel.
* Finalize the deployment by submitting only the entity.

```mermaid
sequenceDiagram
    participant Client
    participant Cloudflare
    participant Content Server
    participant Storage Server
    Client ->>+ Cloudflare: POST /entities
    Cloudflare ->>+ Content Server: proxy request
    Content Server ->> Content Server: Validate signature of entity id
    Content Server ->> Content Server: Create a list of missing files
    Content Server -->>- Cloudflare: accepted (202) with list of missing files
    Cloudflare -->>- Client: accepted (202)
    
    par For each file
    Client ->>+ Cloudflare: POST /entities/:id/files
    Cloudflare ->>+ Content Server: proxy request
    Content Server ->> Content Server: Store file locally<br> in temp folder
    Content Server -->>- Cloudflare: ok (201)
    Cloudflare -->>- Client: ok (201)
    end

    Client ->>+ Cloudflare: POST /entities
    Cloudflare ->>+ Content Server: proxy request
    Content Server ->> Content Server: Validate deployment
    Content Server -->>- Cloudflare: ok (201)
    Cloudflare -->>- Client: ok (201)
    
    Content Server ->>+ Storage Server: Move files from temp folder to storage
    Storage Server ->>+ Content Server: ok
```
