#!/usr/bin/env python3
"""
Extract Ottimale/Alto leads from sheet 2026-04-28
Writes results to Desktop/_leads_output.txt
Run: python3 ~/Desktop/_extract_leads.py
"""
import json, re

FILE = "/var/folders/5g/3llfgxjd6rx6n0m994ycbr_r0000gn/T/claude-hostloop-plugins/d10871c981f4fc5f/projects/-Users-tonyvalentinogallitto-Library-Application-Support-Claude-local-agent-mode-sessions-8b52f59f-73ae-43d1-a70b-0b08e74cfb89-65752a00-2d01-4f30-b141-20e405ed4ac5-local-4a3b5c28-54ef-4d04-8308-f23752-l8gijw/49c60d48-724e-43c0-9a94-2a47ca7e2c5b/tool-results/mcp-03410b0c-1679-4901-9edb-dc670df6787b-read_file_content-1779095634028.txt"
OUTPUT = "/Users/tonyvalentinogallitto/Desktop/_leads_output.txt"

print("Reading file...", flush=True)
with open(FILE, 'r', encoding='utf-8') as f:
    raw = f.read()

data = json.loads(raw)
fc = data['fileContent']
lines = fc.split('\n')
print(f"Total lines: {len(lines)}", flush=True)

# --- Find sheet boundaries ---
# The Drive API text representation uses patterns like:
# "# SheetName" or "## SheetName" or "Sheet: SheetName" or just the date as a header
# We'll detect sheet boundaries by looking for lines that contain ONLY a date pattern
# surrounded by minimal other content (e.g., markdown headers or standalone date lines)

sheet_starts = {}  # date -> line index
sheet_order = []

date_re = re.compile(r'^[#\s|]*?(20\d{2}-\d{2}-\d{2})[#\s|]*$')
for i, line in enumerate(lines):
    m = date_re.match(line.strip())
    if m:
        d = m.group(1)
        if d not in sheet_starts:
            sheet_starts[d] = i
            sheet_order.append(d)

# Also try to detect via table header lines that follow a date header
if not sheet_starts:
    # Fallback: look for "## 2026-04-28" style headers
    for i, line in enumerate(lines):
        m = re.search(r'20\d{2}-\d{2}-\d{2}', line)
        if m and len(line.strip()) < 50:
            d = m.group(0)
            if d not in sheet_starts:
                sheet_starts[d] = i
                sheet_order.append(d)

print(f"Sheets found: {len(sheet_order)}")
if sheet_order:
    print(f"Date range: {min(sheet_order)} to {max(sheet_order)}")
    print(f"All sheets: {sheet_order}")

# --- Parse table rows ---
def parse_table_section(lines_slice):
    """Parse markdown table rows into list of dicts."""
    rows = []
    headers = None
    for line in lines_slice:
        line = line.strip()
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.split('|')]
        cells = [c for c in cells if c != '']  # remove empty border cells
        if not cells:
            continue
        # Skip separator rows like |:--:|:--:|
        if all(re.match(r'^:?-+:?$', c) for c in cells):
            continue
        if headers is None:
            headers = cells
        else:
            if len(cells) == len(headers):
                rows.append(dict(zip(headers, cells)))
            elif len(cells) < len(headers):
                # Pad with empty strings
                cells += [''] * (len(headers) - len(cells))
                rows.append(dict(zip(headers, cells)))
    return rows

# Extract the 2026-04-28 sheet
TARGET = '2026-04-28'
results = []

if TARGET in sheet_starts:
    start = sheet_starts[TARGET]
    # Find end: next sheet start or end of file
    next_sheets = [sheet_starts[d] for d in sheet_order if sheet_starts[d] > start]
    end = min(next_sheets) if next_sheets else len(lines)
    section = lines[start:end]
    rows = parse_table_section(section)
    print(f"\nSheet {TARGET}: {len(rows)} total rows parsed")

    # Filter by Categoria
    for row in rows:
        cat = row.get('Categoria', '').strip()
        if cat in ('Ottimale', 'Alto'):
            results.append({
                'Nome Azienda': row.get('Nome Azienda', ''),
                'Score': row.get('Score', ''),
                'Categoria': cat,
                'Telefono': row.get('Telefono', ''),
                'Città': row.get('Città', ''),
                'Sito Web': row.get('Sito Web', ''),
                'Instagram': row.get('Instagram', ''),
                'LinkedIn': row.get('LinkedIn', ''),
            })
    print(f"Ottimale/Alto leads: {len(results)}")
else:
    print(f"Sheet {TARGET} NOT FOUND in detected sheets.")
    print("Detected sheets:", sheet_order[:10])
    # Debug: print first 50 lines to understand structure
    print("\nFirst 50 lines of file:")
    for i, l in enumerate(lines[:50]):
        print(f"[{i:3d}] {repr(l[:200])}")

# --- Write output ---
with open(OUTPUT, 'w', encoding='utf-8') as out:
    out.write(f"=== LEAD EXTRACTION RESULTS ===\n")
    out.write(f"Source sheet: {TARGET}\n")
    out.write(f"Filter: Categoria = Ottimale OR Alto\n")
    out.write(f"Total leads found: {len(results)}\n\n")
    out.write(f"Total sheets in file: {len(sheet_order)}\n")
    if sheet_order:
        out.write(f"Date range: {min(sheet_order)} to {max(sheet_order)}\n")
        out.write(f"All sheet dates: {', '.join(sorted(sheet_order))}\n\n")

    out.write("=" * 80 + "\n")
    out.write("LEADS LIST\n")
    out.write("=" * 80 + "\n\n")

    for i, r in enumerate(results, 1):
        out.write(f"--- Lead #{i} ---\n")
        out.write(f"Nome Azienda : {r['Nome Azienda']}\n")
        out.write(f"Score        : {r['Score']}\n")
        out.write(f"Categoria    : {r['Categoria']}\n")
        out.write(f"Telefono     : {r['Telefono']}\n")
        out.write(f"Città        : {r['Città']}\n")
        out.write(f"Sito Web     : {r['Sito Web']}\n")
        out.write(f"Instagram    : {r['Instagram']}\n")
        out.write(f"LinkedIn     : {r['LinkedIn']}\n\n")

    # Also write a CSV-style version
    out.write("\n" + "=" * 80 + "\n")
    out.write("CSV FORMAT\n")
    out.write("=" * 80 + "\n")
    out.write("Nome Azienda,Score,Categoria,Telefono,Città,Sito Web,Instagram,LinkedIn\n")
    for r in results:
        row_csv = ','.join(f'"{v}"' for v in [
            r['Nome Azienda'], r['Score'], r['Categoria'],
            r['Telefono'], r['Città'], r['Sito Web'],
            r['Instagram'], r['LinkedIn']
        ])
        out.write(row_csv + "\n")

print(f"\nOutput saved to: {OUTPUT}")
print("Done.")
