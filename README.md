# redbot-site

Sito di presentazione di **Redbot**, per Kairodev.

Sono file statici. Nessun build, nessuna dipendenza, nessuna richiesta di rete
a runtime: si apre `index.html` e funziona. Niente npm, niente bundler, niente
font remoti.

## Provare in locale

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

`http://` e non `file://` perché è il modo in cui GitHub Pages servirà le
cose, e some differenze (le `url()` relative, i MIME type) si vedono solo lì.

## Controlli

```bash
node tools/check.js
```

Verifica che le chiavi di traduzione esistano in italiano e in inglese, che
ogni file referenziato sia presente, che non compaia una risorsa estesa, che
le ancore della testata puntino a sezioni esistenti e che `CNAME`, `404.html` e
`.nojekyll` ci siano. Costa poco e trova subito quello che non si vede: una
chiave dimenticata in una delle due lingue stampa il nome della chiave in
mezzo alla pagina.

## Struttura

```
index.html          tutto il contenuto
assets/style.css    stile, con i colori presi dai costanti del gioco
assets/i18n.js      testi IT/EN
assets/site.js      lingua, testata, rivelamenti allo scroll
favicon.svg
404.html
CNAME               redbot.kairodev.it
.nojekyll
```

I colori in `style.css` non sono una scelta estetica: sono i valori dei
costanti di `/Redbot/scripts/world.gd`, `guardian.gd` e `hud.gd` convertiti in
esadecimale, con il commento che dice quale. Se il gioco cambia, si cambia
lì, e il sito continua a essere lo stesso progetto.

---

# Deploy su GitHub Pages

## 1. Crea il repository

Il piano gratuito di GitHub Pages serve solo repository **pubblici**.

```bash
cd ~/redbot-site
git init
git add -A
git commit -m "Sito di presentazione Redbot"
gh repo create redbot-site --public --source=. --remote=origin --push
```

Se preferisci fare il passaggio da GitHub.com, crea il repository vuoto lì e
poi:

```bash
git remote add origin https://github.com/TUO-USERNAME/redbot-site.git
git branch -M main
git push -u origin main
```

## 2. Attiva GitHub Pages

**Con il workflow (quello che c'è in `.github/workflows/pages.yml`):**

1. vai su **Settings → Pages**
2. **Source: GitHub Actions**
3. salva

Da questo momento ogni push su `main` deploya il sito. Puoi forzare il primo
deploy dalla tab **Actions → Deploy del sito → Run workflow**.

**Senza workflow**, se preferisci la pubblicazione da branch:

1. carica il sito nella cartella `gh-pages`
2. **Settings → Pages → Source:Deploy from a branch**, branch `gh-pages`, cartella `/ (root)`

Il metodo con il workflow è preferibile: non finisce i file di sviluppo nel
ramo pubblicato, e la pubblicazione non si rompe quando qualcuno committa per
errore.

## 3. Collega il sottodominio

Il file `CNAME` c'è già e contiene `redbot.kairodev.it`. GitHub lo legge da
solo, ma il dominio va comunque dichiarato una volta nelle impostazioni:

**Settings → Pages → Custom domain** → `redbot.kairodev.it` → **Save**

### DNS

Su `kairodev.it` crea un record per il sottodominio `redbot`:

| Tipo | Nome | Valore |
|---|---|---|
| `CNAME` | `redbot` | `TUO-USERNAME.github.io` |

Non usare record `A` con l'IP del sito: per un **sottodominio** il `CNAME` è
il modo giusto, e non funziona con il DNS "apex" che alcuni provider impongono
sui domini principali.

> Se `kairodev.it` è su **Cloudflare**, metti il record in modalità **solo DNS**
> (l'icona grigia, non il_proxy arancione). Con il proxy attivo il traffico
> passa da Cloudflare e il certificato di GitHub Pages non viene emesso, quindi
> il sito resta su HTTP o su un certificato non valido.

### Aspetta e verifica

```bash
dig redbot.kairodev.it
```

Deve puntare a `TUO-USERNAME.github.io`. La propagazione di un `CNAME` di
norma si vede in pochi minuti, ma GitHub può mettere qualche ora prima di
vederla.

## 4. Attiva l'HTTPS

**Settings → Pages → Enforce HTTPS**.

GitHub emette il certificato Let's Encrypt appena il dominio risolve. Non è
istantaneo: di solito qualche minuto, in alcuni casi fino a qualche ora. Fino
a quando non è emesso, il sito risponde su HTTP e il lucchetto non c'è.

## 5. Controlla che sia andato a buon fine

```bash
curl -I https://redbot.kairodev.it
```

Risposta `200`, con `content-type: text/html`.

Poi apri il sito e verifica che la lingua switching, le ancore della testata
e la pagina 404 funzionino: la 404 si prova aprendo un indirizzo che non
esiste, per esempio `https://redbot.kairodev.it/inesistente`.

## Problemi frequenti

**Il sito non si aggiorna dopo un push.** guarda la tab **Actions**: se il
workflow è fallito, il motivo è in rosso lì. Il motivo più comune è che
`Settings → Pages` non è su "GitHub Actions", e quindi il workflow non ha i
permessi di pubblicare.

**"Enforce HTTPS" non si può accendere.** GitHub non vede ancora il DNS.
Ricontrolla `dig` e aspetta.

**Il 404 non viene servito.** su GitHub Pages funziona solo se il file si
chiama esattamente `404.html` nella radice.

**Il dominio non parte e l'HTTPS è grigio.** di solito è un record
`CNAME` sbagliato: deve puntare a `TUO-USERNAME.github.io`, non
all'URL del repository.
