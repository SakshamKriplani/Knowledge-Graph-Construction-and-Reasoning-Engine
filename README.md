# Knowledge Graph Construction and Reasoning Engine

Turns PDFs and text files into a knowledge graph, lets you explore it visually, and answers natural-language questions by multi-hop traversal over the graph. Every answer comes with the path it followed and the source sentence behind each hop. If there is no supporting path, it says so.

```
upload PDF/TXT ─▶ clean + chunk ─▶ entities (spaCy) ─▶ relations (Gemini or rules)
               ─▶ entity resolution ─▶ NetworkX graph + SQLite ─▶ React Flow UI
question ─▶ entity linking + pattern detection ─▶ BFS / path search ─▶ answer + evidence
```

![Canonical demo: the Microsoft → OpenAI → Azure path highlighted with evidence](docs/demo.png)

The full spec is in [`plan.md`](plan.md).

## Quick start

### Option A: Running with Docker (Recommended)

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
# Optional: create .env if you want to use a Gemini API key
copy .env.example .env    # Linux/Mac: cp .env.example .env

# Build and start all services
docker-compose up --build
```

- **Frontend**: http://localhost:5173
- **Backend API Docs**: http://localhost:8000/docs

To run in the background: `docker-compose up -d --build`  
To stop containers: `docker-compose down`

---

### Option B: Running Locally

Prerequisites: Python 3.10+, Node.js 18+.

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
cp .env.example .env              # Windows: copy .env.example .env
uvicorn app.main:app --reload     # http://localhost:8000/docs

# Frontend (second terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                       # http://localhost:5173
```

Open the app and click **Load sample data**, then try the canonical question:

> Which cloud infrastructure is associated with the company Microsoft invested in?

Expected: **Azure**, via `Microsoft —invested_in→ OpenAI —uses_infrastructure→ Azure`, with the source sentence for each hop and the three-node path highlighted on the canvas.

## Running without Gemini

`GEMINI_API_KEY` is optional. When it is blank:

- relations come from spaCy dependency rules (`data/verb_relations.json`), confidence 0.5
- answers are template-based, built only from the retrieved path

With a key, Gemini extracts relations per chunk (confidence 0.8) and phrases the final answer. Both are validated: triples must use the controlled vocabulary, quote a sentence that exists in the chunk, and refer to detected entities; an answer that names anything outside the retrieved path is discarded in favour of the template. Any LLM failure falls back to the rule path for that chunk.

Because rule-based triples have confidence 0.5, answers in no-key mode show **medium** confidence. **High** needs mean confidence ≥ 0.7 with evidence on every hop.

## Tests

```bash
cd backend
pytest
```

The suite runs offline with no API key (Gemini is mocked where it is tested). It covers ingestion (PDF, TXT, size and page limits), entity resolution, rule-based relation extraction, graph building, the reasoner (including the canonical question and the unknown-entity case), the Gemini validation layer, and an end-to-end API run on the sample file.

Phase 1 check, which prints everything extracted from the sample:

```bash
cd backend
python -m scripts.extract_sample                 # or pass a path to your own .txt/.pdf
```

## API

Base URL `/api`; interactive docs at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/documents` | Upload and process a file (multipart `file`) |
| POST | `/documents/sample` | Process the bundled sample (used by the UI's "Load sample data") |
| GET | `/documents` | List documents |
| POST | `/graph/build` | Build a graph from `{document_ids}` |
| GET | `/graph/{graph_id}` | Graph + stats |
| GET | `/graph/{graph_id}/entity/{entity_id}` | Entity with incoming/outgoing relationships |
| GET | `/graph/{graph_id}/search?q=` | Fuzzy entity search |
| GET | `/graph/{graph_id}/export` | JSON export |
| POST | `/query` | `{graph_id, question, max_hops?}` → answer, paths, evidence, highlights |
| GET | `/health` | `{status, llm_enabled}` |

## Supported question patterns

| Pattern | Example | How it is answered |
|---|---|---|
| Relation lookup | "Who founded OpenAI?", "Where does Altman work?" | One-hop edges with that relation (either direction); otherwise a directed BFS (≤ `max_hops`) for a path ending in that relation |
| Chained lookup | "Which cloud infrastructure is associated with the company Microsoft invested in?" | X —r1→ Y —r2→ Z |
| Connection | "How are Sam Altman and Microsoft connected?" | Shortest plus up to 3 more simple paths over the undirected graph, max length 4 |
| Fallback | "Tell me about Nvidia" | 2-hop neighbourhood, low confidence |
| Unknown entity | "What did Zorblax Corp acquire?" | Says no entity matched, low confidence |

Relation keywords map to the vocabulary via `data/relation_synonyms.json`.

## Project layout

```
backend/
  app/
    main.py, config.py, models.py, db.py
    routers/      documents.py, graph.py, query.py
    services/     ingestion.py, entity_extractor.py, relation_extractor.py, resolver.py,
                  graph_builder.py, reasoner.py, answerer.py, llm.py (Gemini wrapper)
  data/           tech_terms.json, entity_seeds.json, verb_relations.json,
                  relation_synonyms.json, sample/tech_ecosystem.txt
  scripts/        extract_sample.py
  tests/
frontend/
  src/
    api/client.ts, types.ts, App.tsx
    components/   UploadPanel, GraphCanvas, NodeDetailPanel, SearchFilterBar, QueryPanel
    lib/          layout.ts (dagre), examples.ts, style.ts
render.yaml       Render blueprint for the backend
```

## Implementation notes

- **NER noise.** `en_core_web_sm` often mislabels AI-company names (OpenAI as a place, Anthropic missed). Four deterministic fixes keep the no-key path reliable: an org seed list in the EntityRuler (`data/entity_seeds.json`, alongside the technology terms), surname-only mentions linked to people already seen ("Altman" → Sam Altman), "X is the CEO of Y" forcing X to PERSON, and a majority type vote per normalised name.
- **Entity resolution.** Names merge on normalised equality (case, punctuation, corporate suffixes, spacing, so "OpenAI" / "OpenAI Inc." / "Open AI" merge), token-subset for people only, or `token_sort_ratio ≥ 90`. Token-subset is limited to people because for organisations it would fold "Google DeepMind" into "Google". Types never mix, so "Apple" (ORG) and "apple" (OTHER) stay separate.
- **Rule relations** follow the dependency path between two entities, refuse to jump over a third entity ("Anthropic partnered with Amazon, which built AWS" does not yield Anthropic → AWS), handle passive voice ("developed by"), and only use role nouns ("CEO of", "part of") in short verb-free paths.
- **Persistence.** Graphs are stored in SQLite and rebuilt into NetworkX on first access after a restart.
- **Large graphs.** Above 150 entities the canvas shows the top 150 by degree with a notice; search, query highlights and the focused node are always shown.

## Deploy

**Backend on Render.** New → Blueprint → select this repo (uses `render.yaml`), or create a Python web service with root `backend`, build command `pip install -r requirements.txt && python -m spacy download en_core_web_sm`, and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `ALLOWED_ORIGINS` to the Vercel URL (comma-separate several) and optionally `GEMINI_API_KEY`. The free plan's disk is ephemeral, so uploaded documents and graphs reset on redeploy; the sample loads in one click.

**Frontend on Vercel.** Import the repo, set the root directory to `frontend` (framework: Vite), and add `VITE_API_URL=https://<your-render-service>.onrender.com/api`. Redeploy after changing it, since Vite bakes env vars in at build time.

## Configuration

`backend/.env`

| Variable | Default | |
|---|---|---|
| `GEMINI_API_KEY` | blank | Optional; blank = rule-based only |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `DATABASE_URL` | `sqlite:///./kg.db` | |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `MAX_UPLOAD_MB` | `10` | |
| `MAX_PAGES` | `50` | |

`frontend/.env`: `VITE_API_URL=http://localhost:8000/api`
