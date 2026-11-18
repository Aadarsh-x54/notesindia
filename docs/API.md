# NotesIndia — REST & SSE API Reference

Interactive OpenAPI / Swagger UI is also served automatically by the Java backend at:
- `http://localhost:8080/api/docs/swagger-ui.html`
- `http://localhost:8080/api/docs/openapi`

All JSON endpoints wrap responses in:
```json
{
  "success": true,
  "message": "Optional message",
  "data": { ... },
  "timestamp": "2026-11-18T00:00:00Z"
}
```

---

## 1. Authentication & Users (`/api/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register a new account and issue JWT + refresh token |
| `POST` | `/api/auth/login` | Public | Authenticate by username or email |
| `POST` | `/api/auth/refresh` | Public | Rotate refresh token and issue new access token |
| `POST` | `/api/auth/logout` | Public | Revoke refresh token |
| `POST` | `/api/auth/forgot-password` | Public | Generate password recovery token |
| `POST` | `/api/auth/reset-password` | Public | Reset password with recovery token |
| `GET` | `/api/auth/me` | Bearer | Get current user profile |
| `PUT` | `/api/auth/me` | Bearer | Update full name, bio, institution |
| `PUT` | `/api/auth/me/password` | Bearer | Change current password |
| `GET` | `/api/auth/users/{username}` | Public | View public contributor profile |

---

## 2. Dynamic Categories (`/api/categories`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories?q=&rootOnly=` | Public | List all categories with note counts, hierarchy, accent colors, and `recentlyAdded` flag |
| `GET` | `/api/categories/{slug}` | Public | Category details, parent info, and direct subcategories |
| `GET` | `/api/categories/check-duplicate?name=` | Public | Check exact and fuzzy near-duplicate category names |
| `POST` | `/api/categories` | Bearer | Create a new dynamic category (normalized & deduplicated) |

---

## 3. Notes, Search, Bookmarks & Downloads (`/api/notes`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notes?page=0&size=12` | Public | **Homepage Feed**: ALL published notes in strict reverse chronological order |
| `GET` | `/api/notes/search?q=&page=0&size=12` | Public | Global search across titles, descriptions, subjects, institutions, authors, and categories |
| `GET` | `/api/notes/category/{slug}?includeChildren=true` | Public | Notes belonging to a category (and optionally child categories), without duplication |
| `GET` | `/api/notes/{id}?recordView=true` | Public | Note metadata & records view history |
| `GET` | `/api/notes/{id}/related?limit=4` | Public | Related notes sharing categories |
| `GET` | `/api/notes/{id}/download` | Public | Stream file attachment and increment download count |
| `GET` | `/api/notes/{id}/preview` | Public | Stream inline preview for PDF, TXT, MD |
| `POST` | `/api/notes` (`multipart/form-data`) | Bearer | Upload note file, assign existing categories and/or create new categories dynamically |
| `PUT` | `/api/notes/{id}` | Owner/Staff | Edit title, description, metadata, and categories |
| `DELETE` | `/api/notes/{id}` | Owner/Staff | Soft-delete note and remove from Padhaku AI vector index |
| `POST` | `/api/notes/{id}/bookmark` | Bearer | Toggle bookmark |
| `GET` | `/api/notes/bookmarks` | Bearer | List user's bookmarked notes |
| `GET` | `/api/notes/my-uploads` | Bearer | List user's upload history |
| `GET` | `/api/notes/user/{username}` | Public | List a contributor's published uploads |
| `GET` | `/api/notes/recently-viewed` | Bearer | List user's recently viewed notes |
| `POST` | `/api/notes/{id}/report` | Bearer | Submit a moderation report |

---

## 4. Padhaku AI Gateway (`/api/ai`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ai/status` | Public | Active local LLM model, vector store, indexed chunk count |
| `GET` | `/api/ai/conversations` | Bearer | List user's saved Padhaku AI chat history |
| `POST` | `/api/ai/conversations` | Bearer | Create a new conversation (optionally focused on a specific `focusedNoteId`) |
| `GET` | `/api/ai/conversations/{id}` | Bearer | Load conversation messages & cited notes |
| `POST` | `/api/ai/conversations/{id}/messages` | Bearer | Send message (non-streaming RAG response) |
| `POST` | `/api/ai/conversations/{id}/stream` | Bearer | Send message and stream SSE events (`references`, `token`, `done`) |
| `POST` | `/api/ai/conversations/{id}/regenerate` | Bearer | Regenerate the latest assistant response |
| `DELETE` | `/api/ai/conversations/{id}/messages` | Bearer | Clear messages in a conversation |
| `DELETE` | `/api/ai/conversations/{id}` | Bearer | Delete conversation |
| `POST` | `/api/ai/extract-document` | Bearer | Extract text from an ad-hoc uploaded PDF/DOCX/PPTX/TXT to study in chat |

---

## 5. Admin & Moderation (`/api/admin`)

Requires `ROLE_ADMIN` or `ROLE_MODERATOR` (user management requires `ROLE_ADMIN`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Platform counts, storage usage, downloads, and category growth analytics |
| `GET` | `/api/admin/reports?status=` | List moderation reports |
| `POST` | `/api/admin/reports/{id}/review` | Dismiss report or remove reported note |
| `GET` | `/api/admin/notes?q=` | Search and audit all notes |
| `PATCH` | `/api/admin/notes/{id}/status` | Update note status (`PUBLISHED`, `FLAGGED`, `REMOVED`) |
| `POST` | `/api/admin/notes/{id}/reindex` | Trigger synchronous RAG re-indexing into Padhaku AI |
| `PUT` | `/api/admin/categories/{id}` | Rename, recolor, or reparent a category |
| `POST` | `/api/admin/categories/merge` | Merge duplicate source category into target category |
| `DELETE` | `/api/admin/categories/{id}` | Delete an empty category |
| `GET` | `/api/admin/users?q=` | List/search users (`ADMIN` only) |
| `PATCH` | `/api/admin/users/{id}` | Update user role or active/suspended status (`ADMIN` only) |
| `GET` | `/api/admin/audit-logs` | View platform administrative audit trail |
