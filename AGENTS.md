<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:no-em-dashes -->
# No em dashes anywhere

The founder has a hard rule: NO em dashes (U+2014, the character `—`). This applies to every surface: UI copy, code comments, commit messages, chat replies, migration comments, blog posts, everything. Use a comma, period, colon, semicolon, parenthesis, or the word "and" instead, depending on context. En dashes are only acceptable for numeric ranges ("3 to 5" is preferred even there).
<!-- END:no-em-dashes -->

<!-- BEGIN:migrations-convention -->
# Supabase migrations: every file MUST register itself

We track applied migrations in `public._migrations` (created in `0014_migrations_tracking.sql`). Every NEW migration file MUST end with a self-registration line so the server-side record stays accurate:

```sql
insert into public._migrations(name) values ('NNNN_name')
  on conflict (name) do nothing;
```

Replace `NNNN_name` with the filename minus the `.sql` extension. The `on conflict do nothing` clause keeps the line idempotent so a migration that gets re-run by mistake does not error.

To audit what is applied vs what is on disk:
```
select name from public._migrations order by name;
```
Then compare against `ls supabase/migrations/`.
<!-- END:migrations-convention -->

