## The `location` Block — nginx's Most Important Matching Rule

This section is critical. `location` matching is where most nginx config confusion comes from. Invest time here — it pays off every day you work with nginx.

### What Does a `location` Block Do?

A `location` block says: "When the request URI matches this pattern, apply these directives."

```nginx
server {
    listen 80;

    location / {
        # handles most requests
    }

    location /api/ {
        # handles requests starting with /api/
    }

    location /images/ {
        # handles requests starting with /images/
    }
}
```

When a request for `/api/users` comes in, nginx must decide which `location` block handles it. The rules for this decision are precise and worth understanding deeply.

### Location Match Types

nginx supports several types of location matching. Here they are in priority order (highest priority first):

| Type | Syntax | Meaning | Priority |
|---|---|---|---|
| Exact match | `location = /path` | URI must be exactly this | 1 (highest) |
| Preferential prefix | `location ^~ /path` | URI starts with this, skip regex | 2 |
| Regex (case-sensitive) | `location ~ \.php$` | URI matches this regex | 3 |
| Regex (case-insensitive) | `location ~* \.(jpg\|png)$` | URI matches this regex (case-insensitive) | 3 |
| Standard prefix | `location /path` | URI starts with this | 4 (lowest) |

### How nginx Decides — The Matching Algorithm

This is the exact process nginx follows for every request:

**Step 1:** nginx checks all **prefix locations** (exact, preferential prefix, and standard prefix). It finds the **longest matching prefix**.

**Step 2:** If the longest matching prefix is an **exact match** (`=`), use it immediately. Done.

**Step 3:** If the longest matching prefix is a **preferential prefix** (`^~`), use it immediately. No regex check. Done.

**Step 4:** nginx now checks **all regex locations**, in the order they appear in the config file. The **first regex that matches** wins.

**Step 5:** If no regex matches, nginx uses the longest matching prefix from Step 1.

Here's that process as a flow:

```text
Request URI arrives
       │
       ▼
Find longest matching prefix location
       │
       ├── Is it an exact match (=)?  ──── YES ──> Use it. Done.
       │
       ├── Is it a preferential prefix (^~)?  ──── YES ──> Use it. Done.
       │
       ▼
Check regex locations (top to bottom)
       │
       ├── First regex matches?  ──── YES ──> Use it. Done.
       │
       ▼
No regex matched ──> Use the longest prefix from the first step.
```

### Practical Examples

Given this config:

```nginx
server {
    listen 80;

    location = / {                    # A: exact match for "/"
        return 200 "exact root\n";
    }

    location / {                      # B: prefix match for everything
        return 200 "prefix root\n";
    }

    location /api/ {                  # C: prefix match for /api/
        return 200 "api prefix\n";
    }

    location ^~ /api/internal/ {      # D: preferential prefix for /api/internal/
        return 200 "api internal\n";
    }

    location ~ \.json$ {              # E: regex for anything ending in .json
        return 200 "json regex\n";
    }
}
```

Let's trace some requests:

**Request: `GET /`**

- Prefix matches: A (`= /`, exact), B (`/`).
- A is an exact match → **use A**. Response: `exact root`.

**Request: `GET /about`**

- Prefix matches: B (`/` matches everything starting with `/`).
- Longest prefix: B.
- Not exact, not `^~`. Check regexes: `/about` doesn't end with `.json` → E doesn't match.
- No regex matched → **use B**. Response: `prefix root`.

**Request: `GET /api/users`**

- Prefix matches: B (`/`), C (`/api/`).
- Longest prefix: C (`/api/` is longer than `/`).
- Not exact, not `^~`. Check regexes: `/api/users` doesn't end with `.json` → E doesn't match.
- No regex matched → **use C**. Response: `api prefix`.

**Request: `GET /api/data.json`**

- Prefix matches: B (`/`), C (`/api/`).
- Longest prefix: C.
- Not exact, not `^~`. Check regexes: `/api/data.json` ends with `.json` → **E matches**.
- Regex wins → **use E**. Response: `json regex`.

**Request: `GET /api/internal/status.json`**

- Prefix matches: B (`/`), C (`/api/`), D (`^~ /api/internal/`).
- Longest prefix: D.
- D is `^~` → **use D immediately, skip regex**. Response: `api internal`.

Notice how `/api/data.json` was claimed by the regex (E) instead of the prefix (C), but `/api/internal/status.json` stayed with D because `^~` blocks regex evaluation. This is the `^~` superpower — it locks a prefix against regex stealing.

### The Most Common Confusion

People assume `location` blocks are checked in file order from top to bottom. They are not.

**Prefix locations are matched by specificity (longest match), regardless of file order.**

**Regex locations are matched in file order.** The first matching regex wins.

This means:

```nginx
# These two are equivalent — order doesn't matter for prefix matching:
location /api/ { ... }
location / { ... }

# same behavior as:
location / { ... }
location /api/ { ... }
```

But for regex locations, order matters:

```nginx
# This matches .json first:
location ~ \.json$ { return 200 "json"; }
location ~ \.css$  { return 200 "css"; }

# For a request to /style.json.css — first regex (\.json$) doesn't match,
# second regex (\.css$) matches → "css"
```

### Location Matching — Mental Shortcut

When you're looking at a config and trying to figure out which location handles a request:

1. Find the **longest prefix match**.
2. Is it `=` or `^~`? → That's your answer.
3. Otherwise, scan **regexes top-to-bottom**. First match wins.
4. No regex? → Use the longest prefix.

---

