#!/usr/bin/env python3
"""
GaraMaster — Invio cold email alle imprese edili di Firenze
Esegui con: python3 ~/Desktop/invia_email.py
"""
import csv, smtplib, time, random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

# ─────────────────────────────────────────────
# CONFIGURA QUI (inserisci la App Password)
# ─────────────────────────────────────────────
GMAIL_ADDRESS    = "info@nomediagency.it"
GMAIL_APP_PASSWORD = ""   # ← incolla qui la App Password di 16 caratteri

INPUT_CSV = str(Path.home() / "Desktop" / "leads_finali.csv")
SENT_LOG  = str(Path.home() / "Desktop" / "email_inviate.txt")

# TLD non validi da escludere
INVALID_TLDS = {"itp", "htm", "php", "asp"}

# ─────────────────────────────────────────────


def nome_breve(nome_azienda):
    for sep in [" - ", " – ", ",", "  "]:
        if sep in nome_azienda:
            return nome_azienda.split(sep)[0].strip()
    return nome_azienda.strip()


def build_email(nome, citta):
    nome_s = nome_breve(nome)
    subject = f"Gare d'appalto: analisi in 10 minuti invece di 10 ore | GaraMaster"

    body_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.7;max-width:580px;margin:0 auto;padding:24px">

<p>Buongiorno,</p>

<p>mi chiamo <strong>Tony Gallitto</strong>, sono il fondatore di <strong>Nomedia</strong>.</p>

<p>So quanto tempo costa analizzare un disciplinare di gara per decidere se partecipare o meno — spesso ore di lavoro solo per capire se avete i requisiti SOA e qual è il ribasso giusto da offrire.</p>

<p>Abbiamo creato <strong>GaraMaster</strong> proprio per questo: uno strumento AI che in pochi minuti:</p>

<ul style="padding-left:20px">
  <li>📄 <strong>Analizza il disciplinare</strong> e identifica i requisiti chiave</li>
  <li>✅ <strong>Verifica i requisiti SOA</strong> richiesti dalla gara</li>
  <li>📊 <strong>Calcola il ribasso ottimale</strong> per massimizzare le probabilità di aggiudicazione</li>
</ul>

<p style="font-size:16px;font-weight:bold;color:#1a1a2e;border-left:3px solid #2563eb;padding-left:12px;margin:20px 0">
  Da 10 ore di analisi a 10 minuti.
</p>

<p>Se volete vederlo dal vivo, 15 minuti di videochiamata bastano — senza impegno.<br>
Oppure potete <a href="https://www.garamaster.it" style="color:#2563eb">provarlo gratuitamente su garamaster.it</a>.</p>

<p>Resto a disposizione per qualsiasi domanda.</p>

<p>Cordiali saluti,<br>
<strong>Tony Gallitto</strong><br>
Fondatore — Nomedia<br>
🌐 <a href="https://www.garamaster.it" style="color:#2563eb">www.garamaster.it</a></p>

<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:11px;color:#aaa">
Hai ricevuto questa email perché {nome_s} opera nel settore edile e costruzioni.<br>
Per non ricevere future comunicazioni rispondi con "CANCELLA".
</p>
</body></html>"""

    body_text = f"""Buongiorno,

mi chiamo Tony Gallitto, sono il fondatore di Nomedia.

So quanto tempo costa analizzare un disciplinare di gara per decidere se partecipare o meno.

Abbiamo creato GaraMaster: uno strumento AI che in pochi minuti analizza il disciplinare, verifica i requisiti SOA e calcola il ribasso ottimale.

Da 10 ore di analisi a 10 minuti.

Se volete vederlo dal vivo, 15 minuti di videochiamata bastano.
Oppure provatelo gratis su www.garamaster.it

Cordiali saluti,
Tony Gallitto — Nomedia
www.garamaster.it

---
Per non ricevere future comunicazioni rispondi con "CANCELLA".
"""
    return subject, body_html, body_text


def load_sent():
    sent = set()
    if Path(SENT_LOG).exists():
        with open(SENT_LOG) as f:
            for line in f:
                sent.add(line.strip().lower())
    return sent


def log_sent(email):
    with open(SENT_LOG, "a") as f:
        f.write(email.lower() + "\n")


def send_one(smtp, to_email, nome, citta):
    subject, body_html, body_text = build_email(nome, citta)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Nomedia <{GMAIL_ADDRESS}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html",  "utf-8"))
    smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())


def main():
    if not GMAIL_APP_PASSWORD:
        print("❌ Inserisci la GMAIL_APP_PASSWORD nello script!")
        return

    # Carica lead
    leads = []
    with open(INPUT_CSV) as f:
        for row in csv.DictReader(f):
            email = row.get("email", "").strip().lower()
            if not email:
                continue
            tld = email.split(".")[-1]
            if tld in INVALID_TLDS:
                continue
            leads.append(row)

    sent = load_sent()
    to_send = [r for r in leads if r["email"] not in sent]

    print(f"📧 Email da inviare: {len(to_send)} (già inviate: {len(sent)})")
    print()

    sent_count = 0
    errors = 0

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        print("✅ Connesso a Gmail\n")

        for i, lead in enumerate(to_send):
            email = lead["email"]
            nome  = lead["nome_azienda"]
            citta = lead.get("citta", "")

            try:
                send_one(smtp, email, nome, citta)
                log_sent(email)
                sent_count += 1
                print(f"✅ [{i+1:02d}/{len(to_send)}] {email:45s} — {nome[:35]}")
            except Exception as e:
                errors += 1
                print(f"❌ [{i+1:02d}/{len(to_send)}] {email} — ERRORE: {e}")

            # Pausa anti-spam (random 20-50 secondi)
            if i < len(to_send) - 1:
                delay = random.randint(20, 50)
                print(f"    ⏳ attendo {delay}s...")
                time.sleep(delay)

    print(f"\n{'='*55}")
    print(f"✅ Inviate:  {sent_count}")
    print(f"❌ Errori:   {errors}")
    print(f"{'='*55}")
    print("Controlla la tua casella Gmail — le email sono partite!")


if __name__ == "__main__":
    main()
