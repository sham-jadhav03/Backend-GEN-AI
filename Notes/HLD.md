Technical Design Specification: Codebase Intelligence Agent
An AI-Powered System for Understanding Large Production Repositories

Table of Contents
System Architecture Overview (HLD)

Component Interaction & Sequence Flow

Deep Dive: Ingestion, AST Parsing & Multi-Language Routing

Deep Dive: Dynamic Chunking & RAG Vector Pipeline

Deep Dive: Asynchronous Workflows & Caching Strategy (Redis & Bull MQ)

Low-Level Design (LLD): Repository Structure & LangGraph Configuration

Database Models & API Payload Schema Specification

1. System Architecture Overview (HLD)
The system is engineered as an asynchronous, decoupled, multi-layered architecture designed to process source repositories containing up to 40,000 lines of code without incurring API timeouts or processing bottlenecks.

┌────────────────────────────────────────────────────────┐
│                      CLIENT ZONE                       │
│              Browser (React SPA Application)          │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / REST API
┌───────────────────────────▼────────────────────────────┐
│                  API GATEWAY (Express)                 │
│       Auth Middleware • Rate Limiter • Core Router     │
└─────┬────────────────======┬─────────────────────┬─────┘
      │                      │                     │
┌─────▼──────┐         ┌─────▼──────┐        ┌─────▼──────┐
│Auth Service│         │Analysis Svc│        │Cache Service│
│JWT/Bcrypt  │         │Submit/Poll │        │Redis Check │
└────────────┘         └─────┬──────┘        └────────────┘
                             │ Enqueue Job
┌────────────────────────────▼───────────────────────────┐
│                JOB QUEUE (Bull / Redis)                │
│         Async Processing • Resilient Retry Engine      │
└────────────────────────────┬───────────────────────────┘
                             │ Process Work
┌────────────────────────────▼───────────────────────────┐
│              AI PIPELINE LAYER (LangGraph)             │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐│
│    │  Fetch  ├───►│  Parse  ├───►│ Analyse ├───►│Generate ││
│    └────┬────┘    └────┬────┘    └─────────┘    ────┬────┘│
└─────────┼──────────────┼────────────────────────────┼───┘
          │              │                            │
┌─────────▼──────┐┌──────▼───────┐            ┌──────▼──────┐
│   GitHub API   ││   MongoDB    │            │ Claude API  │
│Tree/Raw Content││Persisted Data│            │LLM Inference│
└────────────────┘└──────────────┘            └─────────────┘
Architectural Layer Responsibilities
Client Zone: A responsive React Single Page Application (SPA) designed to ingest target GitHub repository URLs from users and render real-time processing states alongside highly interactive architectural markdown dashboards.

API Gateway Layer: Built with Node.js and Express. It encapsulates request rate-limiting, JWT authentication validation via an auth middleware, and clean routing abstractions to decouple business domains.

Internal Application Services:

Auth Service: Secure verification engine powered by bcrypt password hashing and stateless JSON Web Tokens.

Analysis Service: Handles repository verification, pushes new parsing tasks to the message broker, and manages status-polling interfaces.

Cache Service: High-speed interceptor that prevents repeated processing of identical repositories by matching against existing cryptographic URL hashes.

Orchestration Layer (Bull + Redis): A resilient distributed message queue designed to offload blocking execution tasks from the main HTTP loop to decoupled worker threads.

AI Layer (LangGraph State Machine): An advanced graph-driven agentic platform managing step-by-step state preservation, structural evaluation, and prompt chaining with automated edge-level fallback and retry mechanics.

Downstream Data Providers:

GitHub API: Upstream repository content loader restricted by strict token rate-limiting safeguards.

MongoDB: Persistent multi-collection data engine storing application tenants, repository histories, and finalized analytical JSON graphs.

Claude API: High-context modern reasoning model used to perform structured JSON code mapping and generation.

2. Component Interaction & Sequence Flow
This timeline documents the lifecycle of a repository analysis request, from the client's initial submission to data persistence and visualization.

Frontend        Gateway       Controller       Service       AI Pipeline       Data
   │               │               │              │               │              │
   │── POST ──────►│               │              │               │              │
   │   /api/analyze│               │              │               │              │
   │               │── verifyJWT ─►│              │               │              │
   │               │   validateUrl │              │               │              │
   │               │               │── cache.get ─►               │              │
   │               │               │   (sha256)   │               │              │
   │               │               │              │── Redis GET ──┼─────────────►│
   │               │               │              │◄── HIT ───────┼──────────────│
   │◄──────────────────────────────┼──────────────│               │              │
   │   Return Cached Result (200)  │              │               │              │
   │               │               │              │               │              │
   │               │             [ Cache MISS — Continue Below ]  │              │
   │               │               │── queue.add ─►               │              │
   │               │               │   (repoUrl)  │               │              │
   │◄──────────────────────────────│              │               │              │
   │   202 Accepted { jobId }      │              │               │              │
   │               │               │              │               │              │
   │── GET ───────────────────────►│              │               │              │
   │   /api/jobs/:jobId (Every 2s) │              │               │              │
   │               │               │              │── Worker ────►│              │
   │               │               │              │   Process     │              │
   │               │               │              │               │─ fetchNode ─►│ (GitHub)
   │               │               │              │               │◄─ files ─────│
   │               │               │              │               │─ parseNode ─►│ (AST/IR)
   │               │               │              │               │─ analyseNode─►│ (M1/M2/M3)
   │               │               │              │               │─ generateNode►│ (Claude)
   │               │               │              │               │─ save DB ───►│ (MongoDB)
   │◄──────────────┼───────────────│              │               │              │
   │   poll status: completed      │              │               │              │
   │               │               │              │               │              │
   │── GET ───────────────────────►│              │               │              │
   │   /api/analyze/:repoId/result │              │               │              │
   │◄──────────────────────────────│              │               │              │
   │   200 OK + Full Analysis JSON │              │               │              │
Detailed Execution Sequence Steps
Initiation: The authenticated client transmits a POST request payload containing the target repoUrl to the application network gateway.

Sanitization: The Gateway applies custom middleware validators (verifyJWT and regex-based validateUrl).

Cache Interception: The Repository Controller triggers a non-blocking execution request to the cache provider using a unique SHA-256 hash derived from the clean repository string.

Fast-Path Resolution (Cache HIT): If matching tokens reside within the system's cache layer, the service returns the finalized analysis payload directly to the user within a standard 200 OK cycle, optimizing computing and LLM API costs.

Slow-Path Resolution (Cache MISS): If no matching keys are found in cache memory, the transaction drops into the processing loop.

Task Delegation: The controller submits a task schema { repoUrl, userId, jobId } directly to the Bull message queue broker.

Immediate Acknowledgment: The API immediately signs off an HTTP status code 202 Accepted along with the specific tracking jobId. This releases the client-side UI to render an active, interactive tracking progress loader.

Client Polling Routine: The frontend establishes a non-blocking interval routine hitting GET /api/jobs/:jobId precisely every 2000 milliseconds to capture changing queue execution state properties (waiting ➔ active ➔ completed).

Worker Resource Activation: Concurrently, an isolated worker process pulls the task from the Redis container queue, starting the LangGraph execution flow:

fetchNode: Contacts the external GitHub API to load the structural data tree and underlying raw file components.

parseNode: Maps structural files through targeted parser modules to generate Abstract Syntax Trees (ASTs) and clear Intermediate Representations (IR).

analyseNode: Evaluates target entry points, folder compositions, and explicit cross-file architectural dependencies.

generateNode: Formats prompts with the structural analysis context and transmits it to the Claude API to build standard JSON schemas.

State Commit: The agent captures the final JSON payload and commits it to MongoDB while updating the Redis cache layer.

Payload Extraction: Upon noting a status switch to completed, the polling loop halts and triggers a final query fetch against /api/analyze/:repoId/result to present the interactive code dashboard to the end-user.

3. Deep Dive: Ingestion, AST Parsing & Multi-Language Routing
Processing arbitrary raw code files into a machine-comprehensible structure requires language-aware parsing rather than simple string checking.

                  ┌──────────────────────────────┐
                  │       Raw File Content       │
                  │ (Base64 Decoded From GitHub) │
                  └──────────────┬───────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │      Language Detection      │
                  │ (File Extension / Shebang)   │
                  └──────────────┬───────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │       Language Router        │
                  └──────┬───────┬───────┬───────┘
                         │       │       │
         ┌───────────────┘       │       └───────────────┐
         │ JS / TS               │ Python                │ Java / Other
┌────────▼───────┐      ┌────────▼───────┐      ┌────────▼───────┐
│ @babel/parser  │      │  ast (stdlib)  │      │ Regex Fallback │
└────────┬───────┘      └────────┬───────┘      └────────┬───────┘
         │                       │                       │
         └───────────────┐       │       ┌───────────────┘
                         │       │       │
                  ┌──────▼───────▼───────▼───────┐
                  │   Unified File Record (IR)   │
                  │  Imports • Exports • Funcs   │
                  │  Path • Language • LineCount │
                  └──────────────┬───────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │     Analysis-Ready JSON      │
                  │ Feeds M1 • M2 • M3 + Chunker │
                  └──────────────────────────────┘
Technical Parsing Workflow
Ingestion & Normalization: Source contents are unpacked and converted from raw Base64 data chunks into native utf-8 characters.

Language Extraction: The system reads file extension formats alongside operating system shebang markers (e.g., #!/usr/bin/env node) to correctly classify file types.

Dynamic Routing Matrix: The pipeline assigns processing tasks based on language type:

JavaScript/TypeScript (@babel/parser): Compiles full ECMAScript components into comprehensive semantic syntax topologies. It identifies common module schemas like CommonJS (require) and ESM (import/export).

Python (ast native standard library module): Extracts top-level classes, clear structural method footprints, and cross-package references (import X, from Y import Z).

Java & Secondary Extensions: Applies rigorous string-matching fallbacks to extract code definitions when explicit tree compilers are unavailable.

Intermediate Representation (IR) Normalization: The parsing branches compile their metrics into an identical internal JSON schema structure:

JSON
{
  "filePath": "src/controllers/auth.controller.js",
  "language": "javascript",
  "lineCount": 142,
  "imports": ["../services/auth.service", "../models/User"],
  "exports": ["loginUser", "registerUser"],
  "functions": ["validatePayload", "loginUser", "registerUser"],
  "classes": []
}
Downstream Value Delivery: This structured payload bypasses irrelevant comments and boilerplate code, providing clean structural data directly to the structural analysis modules and the dynamic text chunker.

4. Deep Dive: Dynamic Chunking & RAG Vector Pipeline
To ingest large, 40,000-line enterprise codebases without hitting context limits, incurring high inference costs, or suffering from "lost-in-the-middle" LLM context degradation, the application implements an optimized, context-aware RAG pipeline.

                 ┌──────────────────────────────┐
                 │     Analysis-Ready JSON      │
                 │  All Parsed Code Records     │
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │    Size Threshold Check      │
                 └──────┬───────────────┬───────┘
                        │               │
            Repo < 80k  │               │ Repo ──► 80k Tokens
            Tokens      │               │
┌───────────────────────▼──────┐┌───────▼──────────────────────┐
│         Full Context         ││           Chunker            │
│      Direct LLM Context      ││  Split by Class / Function   │
└───────────────────────┬──────┘│  ~512 Tokens / 50 Overlap  │
                        │       └──────────────┬───────────────┘
                        │                      │
                        │       ┌──────────────▼───────────────┐
                        │       │     Metadata Attachment      │
                        │       │ Path • Chunk Index • Language│
                        │       └──────────────┬───────────────┘
                        │                      │
                        │       ┌──────────────▼───────────────┐
                        │       │       Embedding Model        │
                        │       │   text-embedding-3-small     │
                        │       └──────────────┬───────────────┘
                        │                      │
                        │       ┌──────────────▼───────────────┐
                        │       │    Vector Store (Memory)     │
                        │       │ LangChain MemoryVectorStore  │
                        │       └──────────────┬───────────────┘
                        │                      ▲
                        │                      │ Similarity
                        │                      │ Search Search
                        │               ┌──────┴───────────────┐
                        │               │      Retriever       │
                        │               │ Top-k Relevant Chunks│
                        │               └──────▲───────────────┘
                        │                      │
┌───────────────────────▼──────────────────────┴───────────────┐
│                    Analysis Node (LangGraph)                  │
└──────────────────────────────────────────────────────────────┘
Processing Strategy & Optimization
Adaptive Evaluation Logic: The engine computes the total token weight of the extracted repository files before running any embedding tasks.

Small Repository Optimization (< 80k tokens): Bypasses the vector storage layer completely. It wraps the entire codebase structure directly into the LLM context envelope, reducing generation latency and eliminating unnecessary embedding overhead.

Enterprise Repository Route (≥ 80k tokens): Routes the codebase into the chunking and embedding pipeline to keep context sizes predictable and tightly bounded.

Context-Aware Chunker: Instead of cutting text at arbitrary line or character markers, the system tracks the code structures extracted by the parser. It splits codebases along logical component partitions (such as individual functions, structural classes, or configuration blocks), using a standard target dimension of ~512 tokens backed by a 50-token sliding overlap window to preserve syntactic continuity.

Metadata Injector: Every token chunk is tagged with explicit lineage attributes before generation:

JSON
{
  "sourceFile": "src/services/auth.service.js",
  "chunkPosition": 3,
  "runtimeLanguage": "javascript"
}
Embedding Model: Transforms code blocks into dense 1536-dimensional vector space models using OpenAI's highly optimized text-embedding-3-small engine.

Transient Vector Database: Vectors are committed directly into an ultra-fast, in-memory LangChain MemoryVectorStore. This store provides high-performance cosine similarity searches without the management overhead of an external persistent cloud cluster.

Top-K Retrieval Cycle: When resolving targeted dependency graphs or locating system entry points, the LangGraph analysis agent runs targeted semantic searches, pulling only the most relevant code blocks into the context window to maximize reasoning accuracy while minimizing token utilization.

5. Deep Dive: Asynchronous Workflows & Caching Strategy (Redis & Bull MQ)
The system uses Redis as both an asynchronous task pipeline and a high-performance database caching tier to ensure responsive user interaction during long-running analysis jobs.

RESPONSIBILITY 1 — JOB QUEUE             RESPONSIBILITY 2 — RESULT CACHE

   ┌─────────────────────────┐               ┌─────────────────────────┐
   │    POST /api/analyze    │               │  Redis Key-Value Store  │
   │  GitHub URL from Client │               │   Key: sha256(repoUrl)  │
   └────────────┬────────────┘               │  Value: Full Result JSON│
                │                            └────────────┬────────────┘
   ┌────────────▼────────────┐                            │
   │       Cache Check       │                            │
   │   hash(URL) ➔ Redis GET │                            │
   └──────┬───────────┬──────┘                            │
          │           │                                   │
     MISS │           │ HIT                               │
          │           └──────────────────────────────────┐│
   ┌──────▼──────────────────┐                            ││
   │   Bull Queue (Redis)    │               ┌────────────▼────────────┐
   │ { repoUrl, userId, id } │               │      TTL: 24 Hours      │
   └────────────┬────────────┘               │ Auto-Expire Stale Data  │
                │                            └────────────┬────────────┘
   ┌────────────▼────────────┐                            │
   │   Bull Worker Process   │                            │
   │  Picks Job • Runs AI    │               ┌────────────▼────────────┐
   └────────────┬────────────┘               │   Cache HIT Response    │
                │                            │ Returns Instantly to UI │
   ┌────────────▼────────────┐               └─────────────────────────┘
   │       On Complete       │
   │ Save MongoDB + Redis    │
   └─────────────────────────┘
Operational Framework Specifications
Queue Ingestion Interface: The worker model uses Bull MQ backed by a Redis data layer. When an ingestion job is accepted, the system registers a unique schema reference structure containing user identity tracking attributes and current lifecycle timestamps.

Decoupled Engine Worker: The worker sub-process isolates resource consumption from the core web router. It monitors task assignments, triggers automated fallback error routines if processing faults occur, and supports up to 3 automatic retries per repository job.

Dual-Tier Result Caching: On a successful run, the finalized JSON payload is simultaneously saved to MongoDB (for persistent history) and cached in Redis using a key generated from the repository's SHA-256 hash.

Data Refresh Policy: Cached entries carry a strict Time-To-Live (TTL) configuration of 24 hours (86,400 seconds). This keeps system memory usage efficient and ensures users receive fresh architectural insights when repositories are actively modified on GitHub.

6. Low-Level Design (LLD): Repository Structure & LangGraph Configuration
To implement this design cleanly, the codebase is structured into explicit, highly decoupled modules across the backend and AI layers.

src/
├── controllers/
│   ├── auth.controller.js        # Handles user signup, login token generation
│   ├── analysis.controller.js    # Decoupled repository submission coordinator
│   └── status.controller.js      # In-memory monitoring endpoint for queue tracking
├── middleware/
│   ├── auth.middleware.js        # Validates JWT bearer tokens in request headers
│   └── rateLimit.middleware.js   # Protects endpoints from burst traffic or abuse
├── models/
│   ├── User.model.js             # Mongoose profile document schema configuration
│   └── Analysis.model.js         # Structural analysis data tracking record schema
├── routes/
│   ├── auth.routes.js            # Base routing map for user authentication endpoints
│   └── analysis.routes.js        # Entry paths for validation and result retrieval
├── services/
│   ├── auth.service.js           # Password crypto processing utilities
│   ├── queue.service.js          # Main wrapper for Bull queue task initiation
│   ├── cache.service.js          # Interfaces with Redis for quick get/set operations
│   └── github.service.js         # Abstracted loader interface for GitHub operations
└── ai/
    ├── graph/
    │   ├── analysisGraph.js      # Structural configuration of LangGraph nodes/edges
    │   └── graphState.js         # Type tracking map for shared contextual state
    ├── nodes/
    │   ├── fetchNode.js          # Direct ingestion worker logic for repository source text
    │   ├── parseNode.js          # Normalizes diverse source trees into unified JSON models
    │   ├── analyseNode.js        # Runs heuristics to find main entry points and structural dependencies
    │   └── generateNode.js       # Assembles prompt payloads for Claude API evaluation
    ├── parsers/
    │   ├── jsParser.js           # Babel AST extractor for JS and TS codebases
    │   ├── pyParser.js           # Python syntax crawler utilizing the AST library
    │   └── regexParser.js        # Multi-language string parser fallback configuration
    ├── embeddings/
    │   ├── chunker.js            # Semantic function and block-level code splitting utility
    │   └── vectorStore.js        # Memory store wrapper for text embedding queries
    └── prompts/
        ├── m1.prompt.js          # Specialized context wrapper for structural folder analysis
        ├── m2.prompt.js          # System rules engine for calculating entry points
        ├── m3.prompt.js          # Multi-file connection evaluation mapping context
        └── summary.prompt.js     # Orchestrates architectural summaries and design evaluations
LangGraph Agentic Lifecycle Mapping
The LangGraph workflow operates as a deterministic state machine using a centralized, shared context object (graphState.js). This layout decouples logic and isolates execution phases cleanly:

  ┌───────────────┐
  │   Start Node  │
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │   fetchNode   │ ──► Downloads source structure and target file payloads
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │   parseNode   │ ──► Runs file routers to output normalized JSON tokens
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │  analyseNode  │ ──► Evaluates folder patterns and traces project dependency layers
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │  generateNode │ ──► Structural schema construction using the Claude API
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │   End Node    │
  └───────────────┘
7. Database Models & API Payload Schema Specification
The application relies on highly structured database collections and explicit payload definitions to guarantee data consistency between the backend services, the AI processing layer, and the frontend dashboard.

Mongoose Database Models
1. User Model Schema
Tracks tenant credentials, security parameters, and processing limits.

JavaScript
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  analyses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' }],
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  requestCount: { type: Number, default: 0 }
});
2. Analysis Model Schema
Maintains processing state metadata and stores the complete architectural evaluation payload.

JavaScript
const AnalysisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repoUrl: { type: String, required: true },
  repoUrlHash: { type: String, required: true, index: true },
  jobId: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'active', 'done', 'failed'], default: 'waiting' },
  result: {
    folderStructure: [{
      path: String,
      purpose: String,
      type: { type: String, enum: ['entry', 'logic', 'config', 'view', 'utility'] }
    }],
    entryPoint: {
      file: String,
      executionFlow: [String],
      description: String
    },
    dependencyMap: [{
      file: String,
      imports: [String],
      importedBy: [String],
      depth: Number,
      criticalPath: [String]
    }],
    criticalFiles: [{
      file: String,
      reason: String,
      role: String
    }],
    executionFlow: [{
      layer: String,
      file: String,
      action: String
    }],
    summary: {
      techStack: [String],
      architectureStyle: String,
      keyDesignDecisions: [String]
    }
  },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});
Final API Response Object Shape
When the client triggers a successful request against /api/analyze/:repoId/result, the application delivers the following standardized JSON payload. This payload cleanly populates both the mandatory requirements (M1, M2, M3) and the optional advanced analytics modules (B1, B2, B3).

JSON
{
  "success": true,
  "repoId": "65f1abcd23456789012345ef",
  "repoUrl": "https://github.com/sham-jadhav03/ReSearch-AI",
  "status": "done",
  "data": {
    "folderStructure": [
      {
        "path": "src/controllers/",
        "purpose": "Handles incoming client requests, executes validation blocks, and coordinates response models.",
        "type": "logic"
      },
      {
        "path": "src/routes/",
        "purpose": "Exposes core network routes and maps target path parameters to downstream controller interfaces.",
        "type": "config"
      }
    ],
    "entryPoint": {
      "file": "src/server.js",
      "executionFlow": [
        "Loads global environment variables via dotenv config processing modules.",
        "Establishes a persistent data stream link to MongoDB instances through Mongoose initializers.",
        "Mounts cross-origin resource handling configurations and payload processing JSON tools.",
        "Binds application routers and opens up structural ports to capture inbound client operations."
      ],
      "description": "The primary operational bootstrapping initialization coordinator of the Express architecture ecosystem."
    },
    "dependencyMap": [
      {
        "file": "src/routes/auth.routes.js",
        "imports": ["src/controllers/auth.controller.js"],
        "importedBy": ["src/server.js"],
        "depth": 1,
        "criticalPath": ["src/server.js", "src/routes/auth.routes.js", "src/controllers/auth.controller.js"]
      }
    ],
    "criticalFiles": [
      {
        "file": "src/config/db.js",
        "reason": "Manages core connection pooling logic and error fallbacks for the centralized database cluster.",
        "role": "infrastructure"
      }
    ],
    "executionFlow": [
      {
        "layer": "routing",
        "file": "src/routes/auth.routes.js",
        "action": "Intercepts client-side registration POST requests and applies input safety checks."
      },
      {
        "layer": "controller",
        "file": "src/controllers/auth.controller.js",
        "action": "Triggers password generation transformations and initiates persistence calls."
      }
    ],
    "summary": {
      "techStack": ["Node.js", "Express", "MongoDB", "Redis", "LangGraph"],
      "architectureStyle": "Asynchronous Model-View-Controller (MVC) Micro-Service Pipeline Layout",
      "keyDesignDecisions": [
        "Offloaded long-running analysis workflows to decoupled worker processes via Bull queues to maintain high system responsiveness.",
        "Utilized in-memory token embeddings to dramatically reduce multi-file context lookup times and minimize cloud API operational billing overhead."
      ]
    }
  }
}