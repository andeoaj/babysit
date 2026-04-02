# BabySit — Setup Guide

App per il tracciamento delle 13 ore settimanali di babysitting.

## Configurazione Firebase (10 minuti)

### 1. Crea un progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. Clicca **"Aggiungi progetto"** → dai un nome (es. `babysit-famiglia`)
3. Disabilita Google Analytics se vuoi, poi **"Crea progetto"**

### 2. Abilita Google Authentication

1. Nel progetto → **Build → Authentication**
2. Clicca **"Inizia"**
3. Scheda **"Sign-in method"** → seleziona **Google** → abilitalo
4. Inserisci il nome del progetto e una email di supporto → **Salva**

### 3. Crea il database Firestore

1. **Build → Firestore Database**
2. Clicca **"Crea database"**
3. Scegli **"Inizia in modalità produzione"**
4. Scegli la regione (es. `europe-west1` per Europa)
5. **"Crea"**

### 4. Configura le regole di sicurezza Firestore

Vai su **Firestore → Regole** e sostituisci tutto con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      // Solo utenti Google autenticati possono leggere e scrivere
      allow read, write: if request.auth != null;
    }
  }
}
```

> **Opzionale (più sicuro):** per limitare l'accesso a email specifiche:
> ```
> allow read, write: if request.auth != null
>   && request.auth.token.email in [
>     'genitore1@gmail.com',
>     'genitore2@gmail.com',
>     'babysitter@gmail.com'
>   ];
> ```

Clicca **"Pubblica"**.

### 5. Ottieni la configurazione dell'app

1. **Impostazioni progetto** (icona ingranaggio in alto a sinistra)
2. Scorri fino a **"Le tue app"** → clicca l'icona `</>`  (Web)
3. Dai un nome all'app (es. `babysit-web`) → **"Registra app"**
4. Copia i valori dell'oggetto `firebaseConfig`

### 6. Incolla la config in app.js

Apri `app.js` e sostituisci le righe con `INSERISCI_...`:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "babysit-famiglia.firebaseapp.com",
  projectId:         "babysit-famiglia",
  storageBucket:     "babysit-famiglia.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc...",
};
```

---

## Deploy su GitHub Pages

1. Crea un repository pubblico su GitHub (es. `babysit`)
2. Carica i 3 file: `index.html`, `styles.css`, `app.js`
3. **Settings → Pages → Source: "Deploy from a branch"**
4. Seleziona branch `main`, cartella `/ (root)` → **Save**
5. L'app sarà disponibile su `https://tuo-username.github.io/babysit/`

> **Nota:** Aggiungi il dominio GitHub Pages agli **"Authorized domains"** in Firebase:
> Authentication → Settings → Domini autorizzati → Aggiungi `tuo-username.github.io`

---

## Utilizzo

- **Sessione standard:** toggle on/off per ogni giorno feriale (2h/giorno)
- **Ore extra:** pulsanti +/− per aggiungere ore in step da 30 minuti (qualsiasi giorno, inclusi weekend e serate)
- **Budget:** il pannello in alto mostra in tempo reale le ore usate e quelle disponibili
- **Navigazione:** usa le frecce per spostarti tra le settimane
- **Multi-utente:** le modifiche di uno si vedono immediatamente sugli altri

---

## Struttura dati (Firestore)

```
Collection: sessions
  Document: "2026-04-07"  (una per ogni giorno con dati)
    weekKey:        "2026-03-30"    (lunedì della settimana)
    standardActive: true/false
    extraMinutes:   0               (minuti extra oltre le 2h)
    updatedBy:      { name, email }
    updatedAt:      Timestamp
```
