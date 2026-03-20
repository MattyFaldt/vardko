# VårdKö — How to Use These Prompts with Claude Code

## Overview
The project specification is split into 4 parts because it exceeds what Claude Code can process in a single message. Each part contains a "wait for more" instruction so Claude Code doesn't start coding prematurely.

## How to Feed the Prompts

### Option A: Copy-paste into Claude Code (recommended)
1. Open Claude Code in your terminal
2. Copy the **entire contents** of `prompt-part1.md` and paste it into Claude Code
3. Wait for Claude Code to respond with "Ready for Part 2"
4. Copy and paste `prompt-part2.md`
5. Wait for "Ready for Part 3"
6. Copy and paste `prompt-part3.md`
7. Wait for "Ready for Part 4"
8. Copy and paste `prompt-part4.md`
9. Claude Code will now have the full context and will begin with Steps 1-2

### Option B: Use Claude Code's file reading
1. Place all 4 files in your project directory
2. Tell Claude Code: "Read the files prompt-part1.md through prompt-part4.md in order. They contain the full specification for the VårdKö project. Read all 4 parts before taking any action."

## After Initial Setup
Once Claude Code completes Steps 1-2 (monorepo + shared package), you can proceed with:
- "Continue with Steps 3-4 from the VårdKö specification"
- And so on through the phases defined in ROADMAP.md

## File Summary
| File | Contents |
|------|----------|
| `prompt-part1.md` | Project overview, architecture, security/GDPR, audit trail |
| `prompt-part2.md` | Data model, multi-tenancy, database schema, queue engine, prediction model |
| `prompt-part3.md` | API design, real-time WebSocket, i18n, display board, analytics |
| `prompt-part4.md` | Testing strategy, CI/CD, CLAUDE.md, ROADMAP.md, implementation order |

## Key Design Decisions Explained

### Why custom auth instead of Supabase Auth?
Portability. If you migrate away from Supabase, auth shouldn't break. Also gives full control over the SuperAdmin hidden auth flow.

### Why Redis instead of Supabase Realtime?
Portability and performance. Redis pub/sub is a standard pattern that works with any infrastructure.

### Why Drizzle ORM instead of Prisma?
Drizzle is lighter, closer to SQL, and generates no heavy client. Better for edge/serverless and more portable.

### Why HMAC instead of regular hashing for personnummer?
HMAC with a daily-rotating salt provides:
1. One-way transformation (can't reverse)
2. Daily rotation means old hashes are useless
3. The salt is clinic-specific, so even the same personnummer produces different hashes at different clinics
4. Can verify "same person re-joining" within a day without storing the number

### Why separate superadmin table?
Complete invisibility. If superadmins were in the users table with a role flag, any query on the users table could potentially leak their existence. A separate table with separate auth ensures they're invisible to all normal system operations.
