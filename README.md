# Sala Pesi

App per iPhone (web app installabile) che compone ogni volta la seduta di palestra migliore per oggi.

**Indirizzo:** https://giabbaaa.github.io/sala-pesi/
Su iPhone aprila in Safari, poi Condividi → Aggiungi alla schermata Home.

## Cosa fa
- **Oggi**: prossimo allenamento consigliato con striscia dei 7 giorni, seduta composta in automatico (serie mancanti per muscolo, recupero, priorità, tempo), modificabile prima di iniziare (unisci in superserie, sposta, cambia, togli, +/− serie).
- **Seduta in corso**: barra di avanzamento, immagine animata e indicazioni, ultima volta e carico suggerito, sforzo facile/giusto/al limite, timer di recupero automatico, Annulla, riscaldamento, dischi per lato, cambio esercizio se la macchina è occupata, avviso sugli esercizi saltati, riepilogo con kcal stimate.
- **Piano**: ciclo e traguardo, serie per muscolo negli ultimi 7 giorni, ritmo e giorni non disponibili, priorità, àncore e complementari.
- **Progressi**: massimale stimato (Epley) sulle àncore, record, costanza, peso medio e vita.
- **Alimentazione**: livelli giornalieri (calorie, proteine, grassi, carboidrati) con correzione automatica dal peso medio. I pasti si registrano in Yazio.
- **Impostazioni**: durata seduta, ora per il Calendario, dischi, salti di carico per attrezzo, backup.

Funziona offline. I dati restano solo sul telefono: usa **Esporta backup** ogni tanto.

## Struttura
- `js/catalog.js` esercizi, muscoli, priorità e seduta tipo A/B
- `js/engine.js` regole di allenamento (composizione, progressione, calendario, cicli, kcal, alimentazione)
- `js/app.js` interfaccia
- `sw.js` funzionamento offline (alzare `VERSION` a ogni rilascio)

Regole dal documento "Ricerca fitness per l'app sala pesi". Immagini: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (pubblico dominio).
