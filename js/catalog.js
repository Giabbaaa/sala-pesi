// Catalogo esercizi. Immagini da Free Exercise DB (pubblico dominio, Unlicense).
// work: quanto ogni serie conta per ciascun muscolo (diretta 1, indiretta 0,5).
// type: multi = multiarticolare, iso = isolamento, core = addome/polpacci, time = isometrico a tempo.

export const MUSCLES = {
  petto:       { name: 'Petto' },
  laterali:    { name: 'Deltoide laterale', short: 'Spalle' },
  bicipiti:    { name: 'Bicipiti' },
  tricipiti:   { name: 'Tricipiti' },
  schiena:     { name: 'Schiena' },
  posteriori:  { name: 'Deltoide posteriore', short: 'Post.' },
  addome:      { name: 'Addome' },
  quadricipiti:{ name: 'Quadricipiti', short: 'Quad.' },
  femorali:    { name: 'Femorali' },
  glutei:      { name: 'Glutei' },
  polpacci:    { name: 'Polpacci' },
  avambracci:  { name: 'Avambracci' },
};

// Un solo elenco dei muscoli per tutta l'app (Piano, obiettivi, barre, liste degli esercizi)
export const MUSCLE_ORDER = Object.keys(MUSCLES);
export const ALL_MUSCLES = MUSCLE_ORDER;

const E = (id, name, muscle, type, work, sub, equip, how, extra = {}) =>
  ({ id, name, muscle, type, work, sub, equip, how, cues: how, ...extra });

// how: [posizione, movimento, ritorno, attenzione]
export const EXERCISES = [
  // ---------- Petto ----------
  E('Leverage_Chest_Press', 'Chest press', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Machine_Bench_Press', 'macchina', [
    'Regola il sedile in modo che le maniglie siano all’altezza del centro del petto. Schiena e testa appoggiate, scapole strette e spinte verso il basso, piedi ben piantati.',
    'Spingi le maniglie in avanti espirando, fino a braccia quasi distese. Pensa a spingere con il petto, non con le spalle.',
    'Torna indietro lento (circa 2 secondi) finché senti il petto allungarsi, senza far sbattere i pesi.',
    'Non bloccare i gomiti in fondo e non staccare le spalle dallo schienale: se le spalle salgono, il lavoro passa ai deltoidi.'],
    { base: true, also: ['deltoide anteriore'] }),
  E('Machine_Bench_Press', 'Panca alla macchina', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Leverage_Chest_Press', 'macchina', [
    'Sdraiato sulla panca della macchina, maniglie all’altezza del petto. Scapole strette e petto alto, piccolo arco naturale della schiena.',
    'Spingi verso l’alto espirando, con i gomiti a circa 45° dal busto (non aperti a croce).',
    'Scendi controllato fino a quando le maniglie sono vicine al petto.',
    'Glutei e spalle restano appoggiati per tutto il movimento.'], { also: ['deltoide anteriore'] }),
  E('Leverage_Incline_Chest_Press', 'Chest press inclinata', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Incline_Dumbbell_Press', 'macchina', [
    'Sedile regolato in modo che le maniglie partano all’altezza della parte alta del petto. Schiena appoggiata, scapole strette.',
    'Spingi verso l’alto e leggermente in avanti espirando: lavora soprattutto il petto alto.',
    'Torna lento fino a sentire l’allungamento sotto le clavicole.',
    'Non inarcare troppo la schiena per spingere di più: il carico va sul petto, non sulla zona lombare.'],
    { base: true, also: ['deltoide anteriore'] }),
  E('Smith_Machine_Incline_Bench_Press', 'Panca inclinata al multipower', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Leverage_Incline_Chest_Press', 'macchina', [
    'Panca inclinata a 30° sotto il multipower, bilanciere sopra la parte alta del petto. Presa poco più larga delle spalle.',
    'Sblocca il bilanciere ruotando i polsi e spingi verso l’alto espirando.',
    'Scendi controllato fino a sfiorare il petto alto, gomiti a 45°.',
    'Prima di iniziare controlla dove si aggancia il bilanciere: a fine serie ruota i polsi per bloccarlo.'],
    { also: ['deltoide anteriore'] }),
  E('Barbell_Bench_Press_-_Medium_Grip', 'Panca piana bilanciere', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Dumbbell_Bench_Press', 'bilanciere', [
    'Sdraiato con gli occhi sotto il bilanciere. Presa poco più larga delle spalle, scapole strette, piedi a terra.',
    'Stacca il bilanciere, portalo sopra le spalle e scendi lento fino a sfiorare il petto (all’altezza dei capezzoli).',
    'Spingi verso l’alto espirando, seguendo una linea leggermente obliqua verso il viso.',
    'Con carichi impegnativi fatti assistere. Non far rimbalzare il bilanciere sul petto.'],
    { also: ['deltoide anteriore'] }),
  E('Dumbbell_Bench_Press', 'Panca piana manubri', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Barbell_Bench_Press_-_Medium_Grip', 'manubri', [
    'Sdraiato sulla panca piana, manubri sopra il petto con i palmi verso i piedi. Scapole strette.',
    'Scendi lento portando i manubri ai lati del petto, gomiti a 45°.',
    'Spingi verso l’alto espirando, avvicinando i manubri senza farli battere.',
    'Per partire e finire appoggia i manubri sulle cosce e sdraiati portandoli con te: proteggi le spalle.'],
    { also: ['deltoide anteriore'] }),
  E('Incline_Dumbbell_Press', 'Panca inclinata manubri', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Leverage_Incline_Chest_Press', 'manubri', [
    'Panca inclinata a 30°, manubri ai lati della parte alta del petto, scapole strette.',
    'Spingi verso l’alto espirando, unendo i manubri sopra il petto.',
    'Scendi lento fino a sentire l’allungamento del petto alto.',
    'Inclinazione oltre 45° sposta il lavoro sulle spalle: resta intorno ai 30°.'], { also: ['deltoide anteriore'] }),
  E('Butterfly', 'Chest fly', 'petto', 'iso', { petto: 1 }, 'Cable_Crossover', 'macchina', [
    'Sedile regolato con le maniglie all’altezza del petto. Schiena appoggiata, gomiti leggermente piegati.',
    'Chiudi le braccia davanti al petto come ad abbracciare un albero, espirando. Stringi il petto per un istante.',
    'Apri lento fino a quando le mani sono in linea con le spalle, non oltre.',
    'L’angolo dei gomiti resta lo stesso dall’inizio alla fine: non trasformarlo in una spinta.'], { base: true }),
  E('Dumbbell_Flyes', 'Croci manubri', 'petto', 'iso', { petto: 1 }, 'Butterfly', 'manubri', [
    'Sdraiato sulla panca piana, manubri sopra il petto con i palmi che si guardano, gomiti appena piegati.',
    'Apri le braccia di lato in un ampio arco finché senti il petto allungarsi.',
    'Richiudi con lo stesso arco, espirando, fino sopra il petto.',
    'Usa carichi leggeri: con le braccia aperte la spalla è vulnerabile. Non scendere sotto il livello della panca.'] ),
  E('Cable_Crossover', 'Croci ai cavi alti', 'petto', 'iso', { petto: 1 }, 'Butterfly', 'cavo', [
    'Pulegge in alto, una maniglia per mano, un passo avanti. Busto leggermente inclinato, gomiti appena piegati.',
    'Porta le mani in basso e in avanti fino a incrociarle davanti al bacino, espirando.',
    'Torna lento aprendo le braccia fino a sentire il petto allungarsi.',
    'Il busto resta fermo: niente slancio con la schiena.'], { base: true }),
  E('Low_Cable_Crossover', 'Croci ai cavi dal basso', 'petto', 'iso', { petto: 1 }, 'Cable_Crossover', 'cavo', [
    'Pulegge in basso, una maniglia per mano, un passo avanti tra i cavi. Gomiti appena piegati.',
    'Porta le mani in alto e in avanti fino all’altezza del mento: lavora il petto alto.',
    'Scendi lento fino a quando le mani sono di fianco ai fianchi.',
    'Non alzare le spalle verso le orecchie.'] ),
  E('Pushups', 'Piegamenti', 'petto', 'bw', { petto: 1, tricipiti: 0.5 }, 'Dumbbell_Bench_Press', 'corpo', [
    'Mani a terra poco più larghe delle spalle, corpo dritto dalla testa ai talloni, addome e glutei contratti.',
    'Scendi piegando i gomiti a circa 45° dal busto fino a sfiorare il pavimento con il petto.',
    'Spingi via il pavimento espirando, fino a braccia distese.',
    'Se è troppo difficile appoggia le ginocchia o le mani su una panca. Il bacino non deve cedere verso il basso.'],
    { also: ['deltoide anteriore', 'core'] }),

  // ---------- Schiena ----------
  E('Wide-Grip_Lat_Pulldown', 'Lat machine', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Close-Grip_Front_Lat_Pulldown', 'cavo', [
    'Cosce bloccate sotto i rulli, presa larga sulla barra, petto in fuori e busto appena inclinato indietro.',
    'Tira la barra verso la parte alta del petto portando i gomiti in basso e indietro, espirando.',
    'Risali lento fino a braccia distese, lasciando salire anche le scapole.',
    'Non tirare con le braccia e non dondolare: immagina di mettere i gomiti nelle tasche posteriori.'], { base: true }),
  E('Close-Grip_Front_Lat_Pulldown', 'Lat machine presa stretta', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5 }, 'Underhand_Cable_Pulldowns', 'cavo', [
    'Maniglia a presa stretta o barra con le mani vicine, cosce sotto i rulli, busto appena inclinato indietro.',
    'Porta la maniglia al petto alto tenendo i gomiti vicini al corpo.',
    'Risali lento fino a braccia distese.',
    'Senti lavorare la schiena, non le braccia: il movimento parte dalle scapole.'], { base: true }),
  E('Underhand_Cable_Pulldowns', 'Lat machine presa inversa', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5 }, 'Close-Grip_Front_Lat_Pulldown', 'cavo', [
    'Barra presa con i palmi verso di te, mani alla larghezza delle spalle, petto alto.',
    'Tira la barra al petto con i gomiti lungo i fianchi, espirando.',
    'Risali lento fino a braccia distese.',
    'Non dondolare con il busto per aiutarti.'] ),
  E('Seated_Cable_Rows', 'Pulley basso', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Leverage_Iso_Row', 'cavo', [
    'Seduto con i piedi sulla pedana e le ginocchia morbide, maniglia stretta in mano, schiena dritta.',
    'Tira la maniglia verso l’ombelico stringendo le scapole e portando il petto in fuori, espirando.',
    'Allunga le braccia in avanti lentamente, lasciando scorrere le scapole senza curvare la schiena.',
    'Il busto resta quasi fermo: non tirare con la schiena all’indietro.'], { base: true }),
  E('Seated_One-arm_Cable_Pulley_Rows', 'Pulley a un braccio', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Seated_Cable_Rows', 'cavo', [
    'Seduto al pulley basso con una maniglia singola, schiena dritta, l’altra mano sul ginocchio.',
    'Tira la maniglia verso il fianco con il gomito vicino al corpo, ruotando appena il busto.',
    'Allunga in avanti lento, lasciando avanzare la spalla.',
    'Fai prima tutte le ripetizioni con un braccio, poi con l’altro: segna le ripetizioni del lato più debole.'] ),
  E('Leverage_Iso_Row', 'Rematore alla macchina', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Seated_Cable_Rows', 'macchina', [
    'Petto appoggiato al supporto, sedile regolato in modo da arrivare alle maniglie a braccia distese.',
    'Tira le maniglie portando i gomiti indietro e stringendo le scapole, espirando.',
    'Pausa di un secondo, poi torna lento a braccia distese.',
    'Il petto resta sempre a contatto con il supporto.'], { base: true }),
  E('Leverage_High_Row', 'High row alla macchina', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Wide-Grip_Lat_Pulldown', 'macchina', [
    'Seduto con le cosce bloccate, maniglie prese in alto davanti a te.',
    'Tira in basso e indietro verso il petto, portando i gomiti dietro il corpo.',
    'Risali lento fino a braccia distese.',
    'Petto alto e spalle basse per tutto il movimento.'] ),
  E('One-Arm_Dumbbell_Row', 'Rematore manubrio', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Seated_One-arm_Cable_Pulley_Rows', 'manubri', [
    'Mano e ginocchio dello stesso lato appoggiati sulla panca, schiena piatta, manubrio nell’altra mano a braccio disteso.',
    'Tira il manubrio verso il fianco con il gomito vicino al corpo, espirando.',
    'Scendi lento fino a braccio disteso, lasciando allungare la schiena.',
    'Schiena piatta come un tavolo: non ruotare il busto per sollevare di più.'] ),
  E('Bent_Over_Barbell_Row', 'Rematore bilanciere', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'One-Arm_Dumbbell_Row', 'bilanciere', [
    'In piedi, ginocchia piegate, busto inclinato in avanti a circa 45° con la schiena dritta. Bilanciere a braccia tese.',
    'Tira il bilanciere verso l’ombelico portando i gomiti indietro, espirando.',
    'Scendi controllato fino a braccia distese.',
    'Esercizio impegnativo per la zona lombare: schiena sempre dritta, carichi moderati.'] ),
  E('T-Bar_Row_with_Handle', 'Rematore T-bar', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Leverage_Iso_Row', 'bilanciere', [
    'A cavallo del bilanciere con la maniglia a V, ginocchia piegate, busto inclinato e schiena dritta.',
    'Tira la maniglia verso il petto stringendo le scapole.',
    'Scendi lento fino a braccia distese.',
    'Se c’è la versione con appoggio per il petto, è più facile tenere la schiena ferma.'], { bar: 0 }),
  E('Straight-Arm_Pulldown', 'Pullover al cavo', 'schiena', 'iso', { schiena: 1 }, 'Rope_Straight-Arm_Pulldown', 'cavo', [
    'Davanti alla puleggia alta con la barra, braccia quasi tese, busto appena inclinato in avanti.',
    'Porta la barra in basso fino alle cosce in un arco, tenendo le braccia quasi tese.',
    'Risali lento fino all’altezza della testa.',
    'Busto fermo: lavorano i dorsali, non i tricipiti.'], { base: true }),
  E('Rope_Straight-Arm_Pulldown', 'Pullover al cavo con corda', 'schiena', 'iso', { schiena: 1 }, 'Straight-Arm_Pulldown', 'cavo', [
    'Come il pullover al cavo, ma con la corda.',
    'Porta la corda in basso fino alle cosce e aprila in fondo.',
    'Risali lento.',
    'Braccia quasi tese per tutto il movimento.'] ),
  E('Band_Assisted_Pull-Up', 'Trazioni assistite', 'schiena', 'bw', { schiena: 1, bicipiti: 0.5 }, 'Wide-Grip_Lat_Pulldown', 'corpo', [
    'Alla sbarra con un elastico sotto le ginocchia o sulla macchina per trazioni assistite. Presa poco più larga delle spalle.',
    'Tira il petto verso la sbarra portando i gomiti in basso, fino a passare con il mento.',
    'Scendi lento fino a braccia distese.',
    'Meno assistenza = più difficile. Annota nella nota personale il contrappeso o l’elastico che usi.'] ),

  // ---------- Spalle (deltoide laterale) ----------
  E('Machine_Shoulder_Military_Press', 'Shoulder press', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Leverage_Shoulder_Press', 'macchina', [
    'Sedile regolato con le maniglie all’altezza delle spalle, schiena appoggiata.',
    'Spingi verso l’alto espirando, senza inarcare la schiena.',
    'Scendi lento fino all’altezza del mento.',
    'Non bloccare i gomiti in alto. Se senti fastidio alla spalla, riduci l’ampiezza.'], { base: true, also: ['deltoide anteriore'] }),
  E('Leverage_Shoulder_Press', 'Shoulder press a leva', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Machine_Shoulder_Military_Press', 'macchina', [
    'Schiena appoggiata, maniglie all’altezza delle spalle.',
    'Spingi verso l’alto espirando.',
    'Torna lento fino all’altezza del mento.',
    'Non bloccare i gomiti e non staccare la schiena.'], { also: ['deltoide anteriore'] }),
  E('Dumbbell_Shoulder_Press', 'Shoulder press manubri', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Machine_Shoulder_Military_Press', 'manubri', [
    'Seduto su panca con schienale verticale, manubri all’altezza delle orecchie, palmi in avanti.',
    'Spingi verso l’alto avvicinando i manubri sopra la testa, espirando.',
    'Scendi lento fino all’altezza delle orecchie.',
    'Addome contratto: la schiena non deve inarcarsi.'], { also: ['deltoide anteriore'] }),
  E('Arnold_Dumbbell_Press', 'Arnold press', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Dumbbell_Shoulder_Press', 'manubri', [
    'Seduto, manubri davanti al viso con i palmi verso di te, gomiti in basso.',
    'Spingi verso l’alto ruotando i palmi in avanti durante la salita.',
    'Scendi ruotando di nuovo i palmi verso di te.',
    'Movimento fluido e controllato, senza slancio.'], { also: ['deltoide anteriore'] }),
  E('Cable_Seated_Lateral_Raise', 'Alzate laterali al cavo', 'laterali', 'iso', { laterali: 1 }, 'Side_Lateral_Raise', 'cavo', [
    'Di fianco alla puleggia bassa, maniglia nella mano più lontana, cavo davanti al corpo.',
    'Sali di lato fino all’altezza della spalla guidando con il gomito, gomito appena piegato.',
    'Scendi lento: il cavo tiene il muscolo in tensione anche in basso.',
    'Busto fermo, spalla bassa (non alzarla verso l’orecchio). Prima un braccio, poi l’altro.'], { base: true }),
  E('Side_Lateral_Raise', 'Alzate laterali manubri', 'laterali', 'iso', { laterali: 1 }, 'Cable_Seated_Lateral_Raise', 'manubri', [
    'In piedi, manubri ai fianchi, busto appena inclinato in avanti, gomiti morbidi.',
    'Sali di lato fino all’altezza delle spalle, con il mignolo appena più alto del pollice.',
    'Scendi lento in 2-3 secondi.',
    'Niente slancio con il busto: meglio un carico leggero fatto bene.'], { base: true }),
  E('One-Arm_Side_Laterals', 'Alzate laterali un braccio', 'laterali', 'iso', { laterali: 1 }, 'Side_Lateral_Raise', 'manubri', [
    'In piedi di fianco a un appoggio, tieniti con una mano e inclinati appena di lato. Manubrio nell’altra mano.',
    'Sali di lato fino all’altezza della spalla.',
    'Scendi lento.',
    'L’inclinazione aumenta la tensione nella prima parte del movimento.'] ),
  E('Upright_Cable_Row', 'Tirate al mento al cavo', 'laterali', 'multi', { laterali: 1 }, 'Cable_Seated_Lateral_Raise', 'cavo', [
    'Davanti alla puleggia bassa con la barra, presa alla larghezza delle spalle.',
    'Tira la barra verso il petto portando i gomiti in alto e di lato, fino all’altezza delle spalle.',
    'Scendi lento fino a braccia distese.',
    'Non salire oltre le spalle e non stringere troppo la presa: proteggi la spalla.'], { also: ['trapezio'], hidden: true }),   // tolto: rischio per la spalla
  E('Lateral_Raise_-_With_Bands', 'Alzate laterali con elastico', 'laterali', 'bw', { laterali: 1 }, 'Side_Lateral_Raise', 'corpo', [
    'In piedi sull’elastico, un capo per mano, braccia lungo i fianchi.',
    'Sali di lato fino all’altezza delle spalle.',
    'Scendi lento resistendo all’elastico.',
    'Ottimo a casa: per renderlo più duro accorcia l’elastico.'] ),

  // ---------- Deltoide posteriore ----------
  E('Reverse_Machine_Flyes', 'Rear delt machine', 'posteriori', 'iso', { posteriori: 1 }, 'Face_Pull', 'macchina', [
    'Seduto con il petto contro il supporto, maniglie all’altezza delle spalle.',
    'Apri le braccia all’indietro con i gomiti morbidi, fino a quando sono in linea con il corpo.',
    'Torna lento in avanti.',
    'Non stringere troppo le scapole: il lavoro deve restare sulla parte dietro della spalla.'], { base: true }),
  E('Face_Pull', 'Face pull', 'posteriori', 'iso', { posteriori: 1 }, 'Reverse_Machine_Flyes', 'cavo', [
    'Corda sulla puleggia all’altezza del viso, presa con i pollici verso di te.',
    'Tira la corda verso la fronte aprendo le mani ai lati del viso, gomiti alti.',
    'Torna lento a braccia distese.',
    'Fa bene anche alla postura: carico leggero e movimento pulito.'], { base: true, also: ['trapezio'] }),
  E('Cable_Rear_Delt_Fly', 'Croci inverse ai cavi', 'posteriori', 'iso', { posteriori: 1 }, 'Reverse_Machine_Flyes', 'cavo', [
    'Tra due pulegge all’altezza delle spalle, cavi incrociati: la mano destra prende il cavo sinistro e viceversa.',
    'Apri le braccia all’indietro a gomiti morbidi fino a quando sono in linea con le spalle.',
    'Torna lento incrociando di nuovo i cavi.',
    'Busto fermo, nessuno slancio.'] ),
  E('Reverse_Flyes', 'Alzate posteriori manubri', 'posteriori', 'iso', { posteriori: 1 }, 'Reverse_Machine_Flyes', 'manubri', [
    'Busto inclinato in avanti quasi parallelo al pavimento (oppure petto appoggiato su una panca inclinata), manubri sotto le spalle.',
    'Apri le braccia di lato con i gomiti morbidi fino all’altezza delle spalle.',
    'Scendi lento.',
    'Carichi leggeri: se devi dare slancio, il peso è troppo.'] ),

  // ---------- Bicipiti ----------
  E('Machine_Bicep_Curl', 'Curl alla macchina', 'bicipiti', 'iso', { bicipiti: 1 }, 'Machine_Preacher_Curls', 'macchina', [
    'Sedile regolato in modo che i gomiti siano allineati al perno della macchina, braccia appoggiate.',
    'Porta le maniglie verso le spalle stringendo il bicipite, espirando.',
    'Scendi lento fino a braccia quasi distese.',
    'Non staccare i gomiti dal cuscino.'], { base: true, also: ['brachiale'] }),
  E('Machine_Preacher_Curls', 'Curl panca Scott macchina', 'bicipiti', 'iso', { bicipiti: 1 }, 'Cable_Preacher_Curl', 'macchina', [
    'Braccia ben appoggiate al cuscino inclinato, ascelle a contatto con il bordo.',
    'Sali stringendo il bicipite, senza staccare i gomiti.',
    'Discesa controllata fino a braccia quasi distese.',
    'In basso il bicipite è molto allungato: niente rimbalzi.'], { base: true }),
  E('Cable_Preacher_Curl', 'Curl panca Scott al cavo', 'bicipiti', 'iso', { bicipiti: 1 }, 'Machine_Preacher_Curls', 'cavo', [
    'Panca Scott davanti alla puleggia bassa, braccia appoggiate al cuscino.',
    'Sali stringendo il bicipite.',
    'Scendi lento fino a braccia quasi distese.',
    'Gomiti sempre appoggiati.'] ),
  E('Standing_Biceps_Cable_Curl', 'Curl ai cavi', 'bicipiti', 'iso', { bicipiti: 1 }, 'Dumbbell_Bicep_Curl', 'cavo', [
    'In piedi davanti alla puleggia bassa con la barra, gomiti fermi ai fianchi.',
    'Porta la barra verso le spalle stringendo il bicipite, espirando.',
    'Scendi fino a braccia distese.',
    'Non dondolare con la schiena e non portare i gomiti in avanti.'], { base: true }),
  E('Dumbbell_Bicep_Curl', 'Curl manubri', 'bicipiti', 'iso', { bicipiti: 1 }, 'Standing_Biceps_Cable_Curl', 'manubri', [
    'In piedi o seduto, manubri lungo i fianchi, gomiti vicini al corpo.',
    'Sali ruotando il palmo verso l’alto durante il movimento.',
    'Scendi lento fino a braccio disteso.',
    'Niente slancio con la schiena: i gomiti restano fermi.'] ),
  E('Barbell_Curl', 'Curl bilanciere', 'bicipiti', 'iso', { bicipiti: 1 }, 'EZ-Bar_Curl', 'bilanciere', [
    'In piedi, bilanciere preso con i palmi in avanti alla larghezza delle spalle, gomiti ai fianchi.',
    'Sali fino alle spalle stringendo il bicipite.',
    'Scendi lento fino a braccia distese.',
    'Se i polsi danno fastidio usa il bilanciere EZ.'], { bar: 10 }),
  E('EZ-Bar_Curl', 'Curl bilanciere EZ', 'bicipiti', 'iso', { bicipiti: 1 }, 'Barbell_Curl', 'bilanciere', [
    'In piedi, bilanciere EZ preso sulle curve interne, gomiti ai fianchi.',
    'Sali fino alle spalle stringendo il bicipite.',
    'Scendi lento.',
    'Più comodo per i polsi del bilanciere dritto.'], { bar: 10 }),
  E('Preacher_Curl', 'Panca Scott bilanciere', 'bicipiti', 'iso', { bicipiti: 1 }, 'Machine_Preacher_Curls', 'bilanciere', [
    'Seduto alla panca Scott, braccia appoggiate al cuscino, bilanciere EZ in mano.',
    'Sali senza staccare i gomiti.',
    'Scendi lento fino a braccia quasi distese.',
    'Niente rimbalzo in basso.'], { bar: 10 }),
  E('Incline_Dumbbell_Curl', 'Curl inclinato manubri', 'bicipiti', 'iso', { bicipiti: 1 }, 'Dumbbell_Bicep_Curl', 'manubri', [
    'Seduto su panca inclinata a 45-60°, braccia distese verso il basso dietro il busto.',
    'Sali con i palmi in avanti, tenendo i gomiti fermi.',
    'Scendi lento fino a braccia distese: il bicipite si allunga molto.',
    'Carico più leggero del curl in piedi.'] ),
  E('Concentration_Curls', 'Curl di concentrazione', 'bicipiti', 'iso', { bicipiti: 1 }, 'Dumbbell_Bicep_Curl', 'manubri', [
    'Seduto, gomito appoggiato all’interno della coscia, manubrio a braccio disteso.',
    'Sali stringendo il bicipite fino alla spalla.',
    'Scendi lento.',
    'Il braccio resta fermo sulla coscia: si muove solo l’avambraccio.'] ),
  E('Cable_Hammer_Curls_-_Rope_Attachment', 'Curl a martello alla corda', 'bicipiti', 'iso', { bicipiti: 1, avambracci: 0.5 }, 'Hammer_Curls', 'cavo', [
    'Davanti alla puleggia bassa con la corda, presa neutra (pollici in alto), gomiti ai fianchi.',
    'Sali verso le spalle tenendo i pollici in alto.',
    'Scendi lento fino a braccia distese.',
    'Lavora molto brachiale e avambraccio: braccia più spesse.'], { base: true, also: ['brachiale'] }),
  E('Hammer_Curls', 'Curl a martello manubri', 'bicipiti', 'iso', { bicipiti: 1, avambracci: 0.5 }, 'Cable_Hammer_Curls_-_Rope_Attachment', 'manubri', [
    'In piedi, manubri lungo i fianchi con i palmi che si guardano.',
    'Sali tenendo i pollici in alto, alternando o insieme.',
    'Scendi lento.',
    'Gomiti fermi ai fianchi.'], { also: ['brachiale'] }),

  // ---------- Tricipiti ----------
  E('Triceps_Pushdown_-_Rope_Attachment', 'Tricipiti alla corda', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown', 'cavo', [
    'Davanti alla puleggia alta con la corda, gomiti incollati ai fianchi, busto appena inclinato.',
    'Spingi in basso fino a braccia distese e apri la corda in fondo, espirando.',
    'Risali lento solo fino a quando l’avambraccio è parallelo al pavimento.',
    'Si muovono solo gli avambracci: gomiti fermi.'], { base: true }),
  E('Triceps_Pushdown', 'Tricipiti al cavo (barra)', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown_-_Rope_Attachment', 'cavo', [
    'Davanti alla puleggia alta con la barra, gomiti ai fianchi.',
    'Spingi in basso fino a braccia distese.',
    'Risali controllato fino a 90°.',
    'Non portare le spalle in avanti per spingere.'] ),
  E('Cable_One_Arm_Tricep_Extension', 'Tricipiti al cavo un braccio', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown_-_Rope_Attachment', 'cavo', [
    'Davanti alla puleggia alta con una maniglia singola, gomito al fianco.',
    'Distendi il braccio verso il basso.',
    'Risali lento fino a 90°.',
    'Utile per bilanciare un braccio più debole.'] ),
  E('Cable_Rope_Overhead_Triceps_Extension', 'French press al cavo sopra la testa', 'tricipiti', 'iso', { tricipiti: 1 }, 'Machine_Triceps_Extension', 'cavo', [
    'Di spalle alla puleggia con la corda dietro la testa, un piede avanti, gomiti in alto vicino alla testa.',
    'Distendi le braccia in avanti e in alto, espirando.',
    'Torna lento piegando i gomiti fino a sentire il tricipite allungarsi.',
    'Lavora il capo lungo del tricipite, quello che dà volume al braccio. Gomiti fermi.'], { base: true }),
  E('Standing_Dumbbell_Triceps_Extension', 'Estensioni manubrio sopra la testa', 'tricipiti', 'iso', { tricipiti: 1 }, 'Cable_Rope_Overhead_Triceps_Extension', 'manubri', [
    'Seduto o in piedi, un manubrio preso con due mani sopra la testa.',
    'Scendi dietro la testa piegando i gomiti, che restano puntati in alto.',
    'Risali fino a braccia distese, espirando.',
    'Capo lungo del tricipite. Schiena dritta, addome contratto.'] ),
  E('EZ-Bar_Skullcrusher', 'French press bilanciere EZ', 'tricipiti', 'iso', { tricipiti: 1 }, 'Standing_Dumbbell_Triceps_Extension', 'bilanciere', [
    'Sdraiato sulla panca, bilanciere EZ sopra il petto a braccia distese.',
    'Piega i gomiti portando il bilanciere verso la fronte o appena dietro la testa.',
    'Distendi le braccia, espirando.',
    'Gomiti fermi e puntati in alto. Carico moderato: i gomiti ringraziano.'], { bar: 10 }),
  E('Tricep_Dumbbell_Kickback', 'Kickback manubrio', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown', 'manubri', [
    'Mano e ginocchio sulla panca, busto parallelo al pavimento, braccio con il gomito vicino al fianco.',
    'Distendi l’avambraccio all’indietro fino a braccio dritto.',
    'Torna lento a 90°.',
    'Si muove solo l’avambraccio: carico leggero.'] ),
  E('Machine_Triceps_Extension', 'Tricipiti alla macchina', 'tricipiti', 'iso', { tricipiti: 1 }, 'Cable_Rope_Overhead_Triceps_Extension', 'macchina', [
    'Sedile regolato con i gomiti appoggiati e allineati al perno.',
    'Distendi le braccia fino in fondo, espirando.',
    'Torna lento.',
    'Gomiti fermi sul cuscino.'] ),
  E('Dip_Machine', 'Dip alla macchina', 'tricipiti', 'multi', { tricipiti: 1, petto: 0.5 }, 'Machine_Triceps_Extension', 'macchina', [
    'Seduto con le maniglie ai lati del corpo, busto dritto.',
    'Spingi in basso fino a braccia distese, espirando.',
    'Risali lento fino a 90° ai gomiti.',
    'Spalle basse, lontane dalle orecchie.'], { base: true }),
  E('Close-Grip_Barbell_Bench_Press', 'Panca presa stretta', 'tricipiti', 'multi', { tricipiti: 1, petto: 0.5 }, 'Dip_Machine', 'bilanciere', [
    'Sdraiato sulla panca, mani alla larghezza delle spalle sul bilanciere.',
    'Scendi verso la parte bassa del petto con i gomiti vicini al corpo.',
    'Spingi verso l’alto espirando.',
    'Mani non troppo strette: i polsi soffrono. Fatti assistere con carichi alti.'] ),
  E('Bench_Dips', 'Dip su panca', 'tricipiti', 'bw', { tricipiti: 1 }, 'Dip_Machine', 'corpo', [
    'Mani sul bordo di una panca o di una sedia dietro di te, gambe avanti.',
    'Scendi piegando i gomiti all’indietro fino a 90°.',
    'Risali spingendo con le mani.',
    'Fattibile a casa. Gambe piegate = più facile. Fermati se la spalla dà fastidio.'] ),

  // ---------- Quadricipiti ----------
  E('Leg_Press', 'Leg press', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5, femorali: 0.5 }, 'Hack_Squat', 'macchina', [
    'Schiena e testa appoggiate, piedi alti sulla pedana alla larghezza delle spalle.',
    'Sblocca le sicure e scendi piegando le ginocchia fin dove non c’è dolore.',
    'Spingi con tutto il piede, soprattutto con i talloni, espirando.',
    'Ginocchio destro: piedi alti e ampiezza senza fastidio. Non bloccare le ginocchia in alto.'], { base: true, inc: 5 }),
  E('Hack_Squat', 'Hack squat', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5 }, 'Leg_Press', 'macchina', [
    'Schiena appoggiata, spalle sotto i cuscinetti, piedi alla larghezza delle spalle.',
    'Scendi controllato con le ginocchia in linea con le punte dei piedi.',
    'Risali spingendo con tutto il piede.',
    'Fermati prima se il ginocchio fa male.'], { inc: 5 }),
  E('Smith_Machine_Squat', 'Squat al multipower', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5 }, 'Leg_Press', 'macchina', [
    'Bilanciere del multipower appoggiato sulle spalle, piedi leggermente avanti.',
    'Scendi piegando anche e ginocchia, schiena dritta.',
    'Risali spingendo con tutto il piede.',
    'Profondità solo fin dove il ginocchio non dà fastidio.'] ),
  E('Goblet_Squat', 'Goblet squat', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5 }, 'Leg_Press', 'manubri', [
    'In piedi, un manubrio tenuto verticale contro il petto, piedi poco più larghi delle spalle.',
    'Scendi tra le gambe tenendo il busto dritto e i gomiti vicino alle ginocchia.',
    'Risali spingendo con i talloni.',
    'Ottimo per imparare lo squat. Ginocchia in linea con le punte.'] ),
  E('Barbell_Squat', 'Squat bilanciere', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5, femorali: 0.5 }, 'Smith_Machine_Squat', 'bilanciere', [
    'Bilanciere sulla parte alta della schiena, piedi alla larghezza delle spalle, sguardo avanti.',
    'Scendi spingendo le anche indietro e piegando le ginocchia, schiena dritta.',
    'Risali spingendo con tutto il piede.',
    'Usa il rack con le sicure. Con il ginocchio sensibile preferisci leg press o goblet squat.'] ),
  E('Dumbbell_Lunges', 'Affondi manubri', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5 }, 'Leg_Press', 'manubri', [
    'In piedi con un manubrio per mano lungo i fianchi.',
    'Fai un passo lungo in avanti e scendi fino a quando il ginocchio dietro sfiora il pavimento.',
    'Spingi con il piede davanti per tornare in piedi. Alterna le gambe.',
    'Il ginocchio davanti resta sopra il piede, non va verso l’interno.'] ),
  E('Bodyweight_Squat', 'Squat a corpo libero', 'quadricipiti', 'bw', { quadricipiti: 1, glutei: 0.5 }, 'Goblet_Squat', 'corpo', [
    'In piedi, piedi poco più larghi delle spalle, braccia avanti.',
    'Scendi come per sederti su una sedia, schiena dritta.',
    'Risali spingendo con i talloni.',
    'Buono a casa. Profondità senza dolore al ginocchio.'] ),
  E('Leg_Extensions', 'Leg extension', 'quadricipiti', 'iso', { quadricipiti: 1 }, 'Single-Leg_Leg_Extension', 'macchina', [
    'Schiena appoggiata, ginocchio allineato al perno, rullo appena sopra le caviglie.',
    'Distendi le gambe fino in alto e tieni un secondo.',
    'Scendi lento.',
    'Ginocchio destro: carico moderato e ampiezza ridotta se dà fastidio.'], { base: true }),
  E('Single-Leg_Leg_Extension', 'Leg extension una gamba', 'quadricipiti', 'iso', { quadricipiti: 1 }, 'Leg_Extensions', 'macchina', [
    'Come la leg extension, ma una gamba alla volta.',
    'Distendi la gamba fino in alto.',
    'Scendi lento.',
    'Utile per caricare meno il ginocchio che dà fastidio.'] ),

  // ---------- Femorali ----------
  E('Seated_Leg_Curl', 'Leg curl seduto', 'femorali', 'iso', { femorali: 1 }, 'Lying_Leg_Curls', 'macchina', [
    'Seduto con il ginocchio allineato al perno, rullo sopra le caviglie e cuscino bloccato sulle cosce.',
    'Porta i talloni verso il sedile, espirando.',
    'Torna lento fino a gambe quasi distese.',
    'Non sollevare il bacino dal sedile.'], { base: true }),
  E('Lying_Leg_Curls', 'Leg curl sdraiato', 'femorali', 'iso', { femorali: 1 }, 'Seated_Leg_Curl', 'macchina', [
    'Prono sulla panca, ginocchia appena oltre il bordo, rullo sopra i talloni.',
    'Porta i talloni verso i glutei.',
    'Discesa controllata.',
    'Bacino sempre premuto sulla panca.'] ),
  E('Standing_Leg_Curl', 'Leg curl in piedi', 'femorali', 'iso', { femorali: 1 }, 'Seated_Leg_Curl', 'macchina', [
    'In piedi alla macchina, una gamba con il rullo dietro la caviglia.',
    'Porta il tallone verso il gluteo.',
    'Scendi lento.',
    'Una gamba alla volta, busto fermo.'] ),
  E('Stiff-Legged_Dumbbell_Deadlift', 'Stacco rumeno manubri', 'femorali', 'multi', { femorali: 1, glutei: 0.5 }, 'Seated_Leg_Curl', 'manubri', [
    'In piedi, manubri davanti alle cosce, ginocchia appena piegate.',
    'Spingi le anche indietro e scendi con la schiena dritta, manubri vicini alle gambe, fino a sentire tirare i femorali.',
    'Risali spingendo le anche in avanti e stringendo i glutei.',
    'La schiena non si curva mai: scendi solo fin dove resta dritta.'] ),
  E('Romanian_Deadlift', 'Stacco rumeno bilanciere', 'femorali', 'multi', { femorali: 1, glutei: 0.5 }, 'Stiff-Legged_Dumbbell_Deadlift', 'bilanciere', [
    'In piedi, bilanciere davanti alle cosce, ginocchia appena piegate.',
    'Spingi le anche indietro facendo scorrere il bilanciere lungo le gambe.',
    'Risali spingendo le anche in avanti.',
    'Schiena dritta, carichi progressivi.'] ),

  // ---------- Glutei ----------
  E('Thigh_Abductor', 'Abductor machine', 'glutei', 'iso', { glutei: 1 }, 'Pull_Through', 'macchina', [
    'Seduto con la schiena appoggiata, cuscinetti all’esterno delle ginocchia.',
    'Apri le gambe spingendo con l’esterno coscia.',
    'Chiudi lento.',
    'Inclinarsi appena in avanti fa lavorare di più il gluteo.'], { base: true }),
  E('Pull_Through', 'Pull through al cavo', 'glutei', 'iso', { glutei: 1, femorali: 0.5 }, 'Thigh_Abductor', 'cavo', [
    'Di spalle alla puleggia bassa con la corda tra le gambe, piedi larghi.',
    'Spingi le anche in avanti stringendo i glutei fino a essere dritto.',
    'Torna spingendo le anche indietro, schiena dritta.',
    'Il movimento parte dalle anche, non dalle braccia.'] ),
  E('One-Legged_Cable_Kickback', 'Kickback al cavo', 'glutei', 'iso', { glutei: 1 }, 'Pull_Through', 'cavo', [
    'Cavigliera alla puleggia bassa, di fronte alla macchina, mani sull’appoggio.',
    'Spingi la gamba indietro stringendo il gluteo.',
    'Torna lento.',
    'Non inarcare la schiena per salire di più.'] ),
  E('Barbell_Hip_Thrust', 'Hip thrust', 'glutei', 'multi', { glutei: 1, femorali: 0.5 }, 'Pull_Through', 'bilanciere', [
    'Schiena alta appoggiata a una panca, bilanciere (con un cuscinetto) sulle anche, piedi a terra.',
    'Spingi le anche verso l’alto fino a busto e cosce in linea, stringendo i glutei.',
    'Scendi controllato.',
    'Mento verso il petto, non inarcare la schiena in alto.'] ),
  E('Butt_Lift_Bridge', 'Ponte glutei', 'glutei', 'bw', { glutei: 1, femorali: 0.5 }, 'Barbell_Hip_Thrust', 'corpo', [
    'Sdraiato sulla schiena, ginocchia piegate, piedi a terra.',
    'Solleva il bacino stringendo i glutei fino a cosce e busto in linea.',
    'Scendi lento.',
    'Fattibile a casa. Più duro con una gamba sola.'] ),

  // ---------- Polpacci ----------
  E('Calf_Press_On_The_Leg_Press_Machine', 'Calf alla leg press', 'polpacci', 'core', { polpacci: 1 }, 'Seated_Calf_Raise', 'macchina', [
    'Alla leg press con solo l’avampiede sul bordo basso della pedana, gambe distese.',
    'Spingi sulle punte il più possibile.',
    'Torna giù lento lasciando allungare bene il polpaccio.',
    'Non togliere le sicure se non serve, e non piegare le ginocchia.'], { base: true, inc: 5 }),
  E('Seated_Calf_Raise', 'Calf seduto', 'polpacci', 'core', { polpacci: 1 }, 'Calf_Press_On_The_Leg_Press_Machine', 'macchina', [
    'Seduto con l’avampiede sul gradino e il cuscinetto sulle cosce.',
    'Sali sulle punte.',
    'Scendi lento fino in fondo.',
    'Pausa di un secondo in alto e in basso.'] ),
  E('Standing_Calf_Raises', 'Calf in piedi alla macchina', 'polpacci', 'core', { polpacci: 1 }, 'Seated_Calf_Raise', 'macchina', [
    'Spalle sotto i cuscinetti, avampiede sul gradino, gambe distese.',
    'Sali sulle punte.',
    'Scendi lento fino in fondo.',
    'Ginocchia dritte ma non bloccate.'] ),
  E('Standing_Dumbbell_Calf_Raise', 'Calf in piedi manubri', 'polpacci', 'core', { polpacci: 1 }, 'Standing_Calf_Raises', 'manubri', [
    'In piedi con l’avampiede su un rialzo, manubrio in una o due mani.',
    'Sali sulle punte.',
    'Scendi lento.',
    'Tieniti a un appoggio con una mano per l’equilibrio.'] ),

  // ---------- Addome ----------
  E('Ab_Crunch_Machine', 'Crunch alla macchina', 'addome', 'core', { addome: 1 }, 'Cable_Crunch', 'macchina', [
    'Seduto con i piedi bloccati e le maniglie o i cuscinetti all’altezza del petto.',
    'Arrotola il busto in avanti avvicinando le costole al bacino, espirando.',
    'Torna lento.',
    'Non tirare con le braccia: lavora l’addome.'], { base: true }),
  E('Cable_Crunch', 'Crunch al cavo', 'addome', 'core', { addome: 1 }, 'Ab_Crunch_Machine', 'cavo', [
    'In ginocchio davanti alla puleggia alta, corda ai lati della testa.',
    'Porta i gomiti verso le cosce arrotolando la schiena, espirando.',
    'Torna lento.',
    'Le anche restano ferme: non sederti sui talloni.'], { base: true }),
  E('Hanging_Leg_Raise', 'Sollevamento gambe alla sbarra', 'addome', 'bw', { addome: 1 }, 'Knee_Hip_Raise_On_Parallel_Bars', 'corpo', [
    'Appeso alla sbarra a braccia distese.',
    'Solleva le gambe (o le ginocchia, più facile) verso il petto arrotolando il bacino.',
    'Scendi lento senza oscillare.',
    'Evita lo slancio: fermati un attimo in basso.'] ),
  E('Knee_Hip_Raise_On_Parallel_Bars', 'Ginocchia al petto alle parallele', 'addome', 'bw', { addome: 1 }, 'Hanging_Leg_Raise', 'corpo', [
    'Avambracci sugli appoggi della sedia romana, schiena appoggiata.',
    'Porta le ginocchia al petto arrotolando il bacino.',
    'Scendi lento.',
    'Non dondolare.'] ),
  E('Crunches', 'Crunch a terra', 'addome', 'bw', { addome: 1 }, 'Ab_Crunch_Machine', 'corpo', [
    'Sdraiato, ginocchia piegate, mani alle tempie.',
    'Solleva le spalle da terra avvicinando le costole al bacino, espirando.',
    'Scendi lento.',
    'Non tirare la testa con le mani.'] ),
  E('Plank', 'Plank', 'addome', 'time', { addome: 1 }, 'Dead_Bug', 'corpo', [
    'A terra sugli avambracci, gomiti sotto le spalle, corpo dritto dalla testa ai talloni.',
    'Tieni la posizione stringendo addome e glutei.',
    'Respira normalmente per tutto il tempo.',
    'Il bacino non deve scendere né salire.'], { base: true }),
  E('Dead_Bug', 'Dead bug', 'addome', 'core', { addome: 1 }, 'Plank', 'corpo', [
    'Sdraiato sulla schiena, braccia verso il soffitto, ginocchia piegate a 90° sopra le anche.',
    'Allunga lentamente un braccio dietro la testa e la gamba opposta in avanti.',
    'Torna e cambia lato.',
    'La zona lombare resta schiacciata a terra.'] ),
  E('Russian_Twist', 'Russian twist', 'addome', 'bw', { addome: 1 }, 'Pallof_Press', 'corpo', [
    'Seduto con il busto inclinato indietro, piedi a terra o sollevati, mani unite (anche con un manubrio).',
    'Ruota il busto da un lato all’altro.',
    'Una rotazione per lato = una ripetizione.',
    'Movimento controllato, schiena dritta.'] ),
  E('Pallof_Press', 'Pallof press', 'addome', 'time', { addome: 1 }, 'Plank', 'cavo', [
    'Di fianco alla puleggia all’altezza del petto, maniglia tenuta con due mani al petto.',
    'Spingi le braccia in avanti e resisti al cavo che vuole farti ruotare.',
    'Tieni la posizione, poi torna al petto. Cambia lato a metà tempo.',
    'Busto e anche fermi, rivolti in avanti.'], { base: true }),

  // ---------- A casa (manubri, tappetino, sedia) ----------
  E('Dumbbell_Floor_Press', 'Floor press manubri', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Dumbbell_Bench_Press', 'manubri', [
    'Sdraiato sul tappetino, ginocchia piegate, manubri sopra il petto con i palmi verso i piedi.',
    'Scendi lento finché i gomiti, a circa 45° dal busto, toccano appena il pavimento.',
    'Pausa di un attimo e spingi verso l’alto espirando, avvicinando i manubri.',
    'Il pavimento ferma i gomiti: è una panca piana più gentile con le spalle.'], { home: true, also: ['deltoide anteriore'] }),
  E('Push-Ups_With_Feet_Elevated', 'Piegamenti con i piedi sulla sedia', 'petto', 'bw', { petto: 1, tricipiti: 0.5 }, 'Pushups', 'corpo', [
    'Mani a terra poco più larghe delle spalle, punte dei piedi sul sedile di una sedia contro il muro. Corpo dritto.',
    'Scendi piegando i gomiti a 45° fino a sfiorare il pavimento con il petto.',
    'Spingi via il pavimento espirando, fino a braccia distese.',
    'Con i piedi in alto lavora di più il petto alto. Se è troppo dura, piedi su un rialzo più basso.'], { home: true, also: ['deltoide anteriore'] }),
  E('Push-Ups_-_Close_Triceps_Position', 'Piegamenti stretti', 'tricipiti', 'bw', { tricipiti: 1, petto: 0.5 }, 'Pushups', 'corpo', [
    'Mani a terra sotto le spalle, più strette del solito. Corpo dritto, addome contratto.',
    'Scendi tenendo i gomiti vicino ai fianchi.',
    'Spingi espirando fino a braccia distese.',
    'Se è troppo dura, ginocchia a terra.'], { home: true }),
  E('Reverse_Crunch', 'Crunch inverso', 'addome', 'bw', { addome: 1 }, 'Crunches', 'corpo', [
    'Sdraiato sul tappetino, braccia lungo i fianchi, ginocchia piegate sopra le anche.',
    'Porta le ginocchia verso il petto staccando il bacino da terra, espirando.',
    'Scendi lento senza appoggiare i piedi.',
    'Muovi il bacino, non dare slancio con le gambe.'], { home: true }),
  E('Seated_Dumbbell_Palms-Up_Wrist_Curl', 'Flessioni del polso', 'avambracci', 'core', { avambracci: 1 }, 'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'manubri', [
    'Seduto sulla sedia, avambracci appoggiati sulle cosce, polsi appena oltre le ginocchia, palmi verso l’alto.',
    'Lascia scendere il manubrio piegando il polso, anche facendolo rotolare un po’ verso le dita.',
    'Richiudi il polso verso l’alto stringendo.',
    'Si muove solo il polso, con ripetizioni alte.'], { home: true, also: ['presa'] }),
  E('Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Estensioni del polso', 'avambracci', 'core', { avambracci: 1 }, 'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'manubri', [
    'Seduto sulla sedia, avambracci sulle cosce, palmi verso il basso, polsi oltre le ginocchia.',
    'Solleva il dorso della mano verso l’alto.',
    'Scendi lento.',
    'Carico più leggero delle flessioni: gli estensori sono più deboli.'], { home: true }),
];

// Note per farli a casa (con la sedia al posto della panca)
const HOME_NOTES = {
  'One-Arm_Dumbbell_Row': 'A casa: mano e ginocchio sul sedile di una sedia stabile.',
  Tricep_Dumbbell_Kickback: 'A casa: mano sul sedile di una sedia, busto inclinato.',
  Dumbbell_Shoulder_Press: 'A casa: seduto su una sedia, schiena appoggiata.',
  Concentration_Curls: 'A casa: seduto sul bordo della sedia.',
  Standing_Dumbbell_Calf_Raise: 'A casa: una gamba alla volta, avampiede su un gradino o un libro spesso, una mano al muro.',
  Goblet_Squat: 'A casa: scendi solo fin dove il ginocchio destro sta bene.',
  Reverse_Flyes: 'A casa: in piedi con il busto inclinato, o seduto sul bordo della sedia con il petto sulle cosce.',
  Standing_Dumbbell_Triceps_Extension: 'A casa: seduto sulla sedia, schiena dritta.',
};

export const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
for (const [id, n] of Object.entries(HOME_NOTES)) EX[id].homeNote = n;

// Esercizi che si possono fare a casa (manubri, tappetino, sedia) e loro priorità predefinite
// (3 sempre, 2 a rotazione, 1 ogni tanto). Le priorità si cambiano in Piano → A casa (settings.homePlan).
export const HOME_PLAN = {
  petto:       { Dumbbell_Floor_Press: 3, 'Push-Ups_With_Feet_Elevated': 3, Pushups: 1 },
  laterali:    { Side_Lateral_Raise: 3, 'One-Arm_Side_Laterals': 2, Dumbbell_Shoulder_Press: 1 },
  bicipiti:    { Hammer_Curls: 3, Dumbbell_Bicep_Curl: 2, Concentration_Curls: 2 },
  tricipiti:   { Standing_Dumbbell_Triceps_Extension: 3, Tricep_Dumbbell_Kickback: 2, 'Push-Ups_-_Close_Triceps_Position': 1 },
  schiena:     { 'One-Arm_Dumbbell_Row': 3 },
  posteriori:  { Reverse_Flyes: 3 },
  addome:      { Crunches: 3, Reverse_Crunch: 2, Dead_Bug: 2, Plank: 1 },
  quadricipiti:{ Goblet_Squat: 3 },
  femorali:    { 'Stiff-Legged_Dumbbell_Deadlift': 3 },
  glutei:      { Butt_Lift_Bridge: 3 },
  polpacci:    { Standing_Dumbbell_Calf_Raise: 3 },
  avambracci:  { 'Seated_Dumbbell_Palms-Up_Wrist_Curl': 3, 'Seated_Dumbbell_Palms-Down_Wrist_Curl': 2 },
};
for (const m of Object.keys(HOME_PLAN)) for (const id of Object.keys(HOME_PLAN[m])) EX[id].home = true;

// Macchine che fanno più esercizi sulla stessa postazione (utile per le superserie)
const STATIONS = { Butterfly: 'pecdeck', Reverse_Machine_Flyes: 'pecdeck', Leg_Press: 'legpress', Calf_Press_On_The_Leg_Press_Machine: 'legpress' };
for (const [id, st] of Object.entries(STATIONS)) EX[id].station = st;

// Ordine degli attrezzi quando si cambia (macchina occupata → cavo → manubri → ...)
export const EQUIP_ORDER = ['macchina', 'cavo', 'manubri', 'bilanciere', 'corpo'];

export const imgs = id => [`img/ex/${id}_0.jpg`, `img/ex/${id}_1.jpg`];

// Range di ripetizioni e recupero per tipo (documento di ricerca)
export const TYPE_RULES = {
  multi: { min: 8, max: 12, rest: 120 },
  iso:   { min: 10, max: 15, rest: 80 },
  core:  { min: 12, max: 20, rest: 60 },
  time:  { min: 30, max: 45, rest: 60, unit: 's' },
  bw:    { min: 8, max: 20, rest: 75 },
};

// Priorità predefinite (per Giabba)
export const DEFAULT_PRIORITY = {
  petto: 'alta', laterali: 'alta', bicipiti: 'alta', tricipiti: 'alta',
  schiena: 'normale', posteriori: 'normale', addome: 'normale',
  quadricipiti: 'minima', femorali: 'minima', glutei: 'minima', polpacci: 'minima', avambracci: 'minima',
};

// Obiettivi di serie nella finestra di 7 giorni, per ciclo
export const TARGETS = {
  alta:    [11, 13, 16],
  normale: [8, 10, 11],
  minima:  [4, 5, 5],
};

// Priorità per esercizio: 3 alta (sempre), 2 media (a rotazione), 1 bassa (ogni tanto)
export const DEFAULT_PLAN = {
  petto:       { Leverage_Chest_Press: 3, Leverage_Incline_Chest_Press: 2, Cable_Crossover: 2, Butterfly: 2, Low_Cable_Crossover: 1, Incline_Dumbbell_Press: 1 },
  laterali:    { Cable_Seated_Lateral_Raise: 3, Side_Lateral_Raise: 2 },
  bicipiti:    { Machine_Bicep_Curl: 3, Standing_Biceps_Cable_Curl: 3, 'Cable_Hammer_Curls_-_Rope_Attachment': 2, Incline_Dumbbell_Curl: 1 },
  tricipiti:   { 'Triceps_Pushdown_-_Rope_Attachment': 3, Cable_Rope_Overhead_Triceps_Extension: 2, Dip_Machine: 2, Standing_Dumbbell_Triceps_Extension: 1 },
  schiena:     { 'Wide-Grip_Lat_Pulldown': 3, Seated_Cable_Rows: 2, Leverage_Iso_Row: 2, 'Close-Grip_Front_Lat_Pulldown': 2, 'One-Arm_Dumbbell_Row': 1 },
  posteriori:  { Reverse_Machine_Flyes: 3, Face_Pull: 2, Cable_Rear_Delt_Fly: 1 },
  addome:      { Ab_Crunch_Machine: 3, Cable_Crunch: 2, Plank: 2, Pallof_Press: 2 },
  quadricipiti:{ Leg_Press: 3, Leg_Extensions: 2 },
  femorali:    { Seated_Leg_Curl: 3 },
  glutei:      { Thigh_Abductor: 3 },
  polpacci:    { Calf_Press_On_The_Leg_Press_Machine: 3 },
  avambracci:  { 'Seated_Dumbbell_Palms-Up_Wrist_Curl': 3, 'Seated_Dumbbell_Palms-Down_Wrist_Curl': 2 },
};

export const EQUIP_GROUPS = [
  { label: 'Macchine', eq: ['macchina'] },
  { label: 'Pesi liberi', eq: ['manubri', 'bilanciere'] },
  { label: 'Cavi', eq: ['cavo'] },
  { label: 'Corpo libero', eq: ['corpo'] },
];

// Carichi di partenza dichiarati da Giabba (novembre 2026)
export const START_LOADS = {
  Leverage_Chest_Press: 55, 'Wide-Grip_Lat_Pulldown': 55, Seated_Cable_Rows: 45,
  Machine_Shoulder_Military_Press: 25, Butterfly: 60, Reverse_Machine_Flyes: 55,
  Leg_Press: 95, Dumbbell_Bicep_Curl: 10, 'Triceps_Pushdown_-_Rope_Attachment': 18,
};

// Seduta tipo A/B per le prime sedute
export const SEED = {
  A: [
    { id: 'Leverage_Chest_Press', sets: 3 },
    { id: 'Wide-Grip_Lat_Pulldown', sets: 3 },
    { id: 'Leg_Press', sets: 2 },
    { id: 'Machine_Shoulder_Military_Press', sets: 2 },
    { id: 'Cable_Seated_Lateral_Raise', sets: 2 },
    { id: 'Standing_Biceps_Cable_Curl', sets: 3, ss: 1 },
    { id: 'Triceps_Pushdown_-_Rope_Attachment', sets: 3, ss: 1 },
    { id: 'Ab_Crunch_Machine', sets: 3 },
  ],
  B: [
    { id: 'Leverage_Incline_Chest_Press', sets: 3 },
    { id: 'Seated_Cable_Rows', sets: 3 },
    { id: 'Seated_Leg_Curl', sets: 2 },
    { id: 'Butterfly', sets: 2, ss: 1 },
    { id: 'Reverse_Machine_Flyes', sets: 2, ss: 1 },
    { id: 'Cable_Seated_Lateral_Raise', sets: 2 },
    { id: 'Cable_Hammer_Curls_-_Rope_Attachment', sets: 2, ss: 2 },
    { id: 'Cable_Rope_Overhead_Triceps_Extension', sets: 2, ss: 2 },
    { id: 'Plank', sets: 3 },
  ],
};
