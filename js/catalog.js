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
};

export const MUSCLE_ORDER = Object.keys(MUSCLES);

const E = (id, name, muscle, type, work, sub, equip, cues, extra = {}) =>
  ({ id, name, muscle, type, work, sub, equip, cues, ...extra });

export const EXERCISES = [
  // Petto
  E('Leverage_Chest_Press', 'Chest press', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Machine_Bench_Press', 'macchina',
    ['Maniglie all’altezza del petto, scapole strette sullo schienale', 'Spingi senza bloccare i gomiti', 'Torna lento, 2 secondi'], { base: true }),
  E('Machine_Bench_Press', 'Panca alla macchina', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Leverage_Chest_Press', 'macchina',
    ['Scapole addotte e petto alto', 'Gomiti a circa 45° dal busto', 'Scendi controllato fino al petto']),
  E('Leverage_Incline_Chest_Press', 'Chest press inclinata', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Incline_Dumbbell_Press', 'macchina',
    ['Lavora il petto alto', 'Spingi verso l’alto e leggermente avanti', 'Non staccare la schiena dallo schienale'], { base: true }),
  E('Incline_Dumbbell_Press', 'Panca inclinata manubri', 'petto', 'multi', { petto: 1, tricipiti: 0.5 }, 'Leverage_Incline_Chest_Press', 'manubri',
    ['Panca a 30°, manubri ai lati del petto', 'Spingi unendo i manubri in alto', 'Scendi lento fino a sentire l’allungamento']),
  E('Butterfly', 'Chest fly', 'petto', 'iso', { petto: 1 }, 'Cable_Crossover', 'macchina',
    ['Gomiti leggermente piegati e fermi', 'Chiudi come ad abbracciare un albero', 'Apri lento, senza andare oltre la spalla'], { base: true }),
  E('Cable_Crossover', 'Croci ai cavi', 'petto', 'iso', { petto: 1 }, 'Butterfly', 'cavo',
    ['Cavi in basso per il petto alto', 'Porta le mani verso l’alto davanti al mento', 'Busto fermo, nessuno slancio'], { base: true }),

  // Schiena
  E('Wide-Grip_Lat_Pulldown', 'Lat machine', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Close-Grip_Front_Lat_Pulldown', 'cavo',
    ['Presa larga, petto in fuori', 'Tira la barra al petto con i gomiti verso il basso', 'Risali lento fino a braccia distese'], { base: true }),
  E('Close-Grip_Front_Lat_Pulldown', 'Lat machine presa stretta', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5 }, 'Underhand_Cable_Pulldowns', 'cavo',
    ['Mani vicine, busto appena inclinato indietro', 'Porta la barra al petto alto', 'Senti la schiena, non le braccia'], { base: true }),
  E('Underhand_Cable_Pulldowns', 'Lat machine presa inversa', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5 }, 'Close-Grip_Front_Lat_Pulldown', 'cavo',
    ['Palmi verso di te, larghezza spalle', 'Gomiti lungo i fianchi', 'Non dondolare con il busto']),
  E('Seated_Cable_Rows', 'Pulley basso', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Leverage_Iso_Row', 'cavo',
    ['Schiena dritta, ginocchia morbide', 'Tira all’ombelico stringendo le scapole', 'Allunga in avanti senza curvare la schiena'], { base: true }),
  E('Leverage_Iso_Row', 'Rematore alla macchina', 'schiena', 'multi', { schiena: 1, bicipiti: 0.5, posteriori: 0.5 }, 'Seated_Cable_Rows', 'macchina',
    ['Petto appoggiato al supporto', 'Gomiti indietro, scapole strette', 'Pausa di un secondo in fondo'], { base: true }),
  E('Straight-Arm_Pulldown', 'Pullover al cavo', 'schiena', 'iso', { schiena: 1 }, 'Rope_Straight-Arm_Pulldown', 'cavo',
    ['Braccia quasi tese', 'Porta la barra fino alle cosce', 'Busto fermo, leggermente inclinato'], { base: true }),
  E('Rope_Straight-Arm_Pulldown', 'Pullover al cavo con corda', 'schiena', 'iso', { schiena: 1 }, 'Straight-Arm_Pulldown', 'cavo',
    ['Braccia quasi tese', 'Apri la corda in fondo al movimento', 'Risali lento']),

  // Spalle
  E('Machine_Shoulder_Military_Press', 'Shoulder press', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Leverage_Shoulder_Press', 'macchina',
    ['Maniglie all’altezza delle spalle', 'Spingi in alto senza inarcare la schiena', 'Scendi fino al mento'], { base: true }),
  E('Leverage_Shoulder_Press', 'Shoulder press a leva', 'laterali', 'multi', { laterali: 0.5, tricipiti: 0.5 }, 'Machine_Shoulder_Military_Press', 'macchina',
    ['Schiena appoggiata', 'Spingi verso l’alto', 'Non bloccare i gomiti']),
  E('Cable_Seated_Lateral_Raise', 'Alzate laterali al cavo', 'laterali', 'iso', { laterali: 1 }, 'Side_Lateral_Raise', 'cavo',
    ['Cavo dal basso, un braccio alla volta', 'Sali di lato fino all’altezza della spalla', 'Gomito appena piegato, guida con il gomito'], { base: true }),
  E('Side_Lateral_Raise', 'Alzate laterali manubri', 'laterali', 'iso', { laterali: 1 }, 'Cable_Seated_Lateral_Raise', 'manubri',
    ['Manubri ai fianchi, busto fermo', 'Sali fino alle spalle, mignolo appena più alto', 'Scendi lento, senza slancio'], { base: true }),
  E('Reverse_Machine_Flyes', 'Rear delt machine', 'posteriori', 'iso', { posteriori: 1 }, 'Face_Pull', 'macchina',
    ['Petto contro il supporto', 'Apri le braccia all’indietro, gomiti morbidi', 'Non stringere troppo le scapole'], { base: true }),
  E('Face_Pull', 'Face pull', 'posteriori', 'iso', { posteriori: 1 }, 'Reverse_Machine_Flyes', 'cavo',
    ['Corda all’altezza del viso', 'Tira verso la fronte aprendo le mani', 'Gomiti alti'], { base: true }),

  // Bicipiti
  E('Machine_Bicep_Curl', 'Curl alla macchina', 'bicipiti', 'iso', { bicipiti: 1 }, 'Machine_Preacher_Curls', 'macchina',
    ['Gomiti allineati al perno della macchina', 'Sali stringendo il bicipite', 'Scendi lento fino a braccio quasi teso'], { base: true }),
  E('Machine_Preacher_Curls', 'Curl panca Scott macchina', 'bicipiti', 'iso', { bicipiti: 1 }, 'Cable_Preacher_Curl', 'macchina',
    ['Braccia ben appoggiate al cuscino', 'Sali senza staccare i gomiti', 'Discesa controllata'], { base: true }),
  E('Cable_Preacher_Curl', 'Curl panca Scott al cavo', 'bicipiti', 'iso', { bicipiti: 1 }, 'Machine_Preacher_Curls', 'cavo',
    ['Braccia appoggiate al cuscino', 'Sali stringendo', 'Scendi lento']),
  E('Standing_Biceps_Cable_Curl', 'Curl ai cavi', 'bicipiti', 'iso', { bicipiti: 1 }, 'Dumbbell_Bicep_Curl', 'cavo',
    ['In piedi, gomiti fermi ai fianchi', 'Sali senza dondolare', 'Scendi fino a braccia distese'], { base: true }),
  E('Dumbbell_Bicep_Curl', 'Curl manubri', 'bicipiti', 'iso', { bicipiti: 1 }, 'Standing_Biceps_Cable_Curl', 'manubri',
    ['Gomiti fermi ai fianchi', 'Ruota il palmo verso l’alto salendo', 'Niente slancio con la schiena']),
  E('Cable_Hammer_Curls_-_Rope_Attachment', 'Curl a martello alla corda', 'bicipiti', 'iso', { bicipiti: 1 }, 'Hammer_Curls', 'cavo',
    ['Presa neutra sulla corda, pollici in alto', 'Lavora brachiale e avambraccio', 'Gomiti fermi'], { base: true }),
  E('Hammer_Curls', 'Curl a martello manubri', 'bicipiti', 'iso', { bicipiti: 1 }, 'Cable_Hammer_Curls_-_Rope_Attachment', 'manubri',
    ['Presa neutra, pollici in alto', 'Sali alternando o insieme', 'Gomiti fermi']),

  // Tricipiti
  E('Triceps_Pushdown_-_Rope_Attachment', 'Tricipiti alla corda', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown', 'cavo',
    ['Gomiti incollati ai fianchi', 'Spingi in basso e apri la corda in fondo', 'Risali solo fino a 90°'], { base: true }),
  E('Triceps_Pushdown', 'Tricipiti al cavo (barra)', 'tricipiti', 'iso', { tricipiti: 1 }, 'Triceps_Pushdown_-_Rope_Attachment', 'cavo',
    ['Gomiti fermi ai fianchi', 'Distendi completamente', 'Risali controllato']),
  E('Cable_Rope_Overhead_Triceps_Extension', 'French press al cavo sopra la testa', 'tricipiti', 'iso', { tricipiti: 1 }, 'Machine_Triceps_Extension', 'cavo',
    ['Di spalle al cavo, corda dietro la testa', 'Distendi in avanti e in alto', 'Lavora il capo lungo del tricipite'], { base: true }),
  E('Machine_Triceps_Extension', 'Tricipiti alla macchina', 'tricipiti', 'iso', { tricipiti: 1 }, 'Cable_Rope_Overhead_Triceps_Extension', 'macchina',
    ['Gomiti appoggiati e fermi', 'Distendi fino in fondo', 'Torna lento']),
  E('Dip_Machine', 'Dip alla macchina', 'tricipiti', 'multi', { tricipiti: 1, petto: 0.5 }, 'Machine_Triceps_Extension', 'macchina',
    ['Busto dritto per i tricipiti', 'Spingi in basso fino a braccia distese', 'Spalle basse, lontane dalle orecchie'], { base: true }),

  // Gambe
  E('Leg_Press', 'Leg press', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5, femorali: 0.5 }, 'Hack_Squat', 'macchina',
    ['Piedi alti sulla pedana: meno carico sul ginocchio', 'Scendi solo fin dove non c’è dolore', 'Non bloccare le ginocchia in alto'], { base: true, inc: 5 }),
  E('Hack_Squat', 'Hack squat', 'quadricipiti', 'multi', { quadricipiti: 1, glutei: 0.5 }, 'Leg_Press', 'macchina',
    ['Schiena ben appoggiata', 'Scendi controllato, ginocchia in linea con i piedi', 'Fermati se il ginocchio fa male'], { inc: 5 }),
  E('Leg_Extensions', 'Leg extension', 'quadricipiti', 'iso', { quadricipiti: 1 }, 'Single-Leg_Leg_Extension', 'macchina',
    ['Ampiezza ridotta se il ginocchio dà fastidio', 'Carico moderato', 'Pausa di un secondo in alto'], { base: true }),
  E('Single-Leg_Leg_Extension', 'Leg extension una gamba', 'quadricipiti', 'iso', { quadricipiti: 1 }, 'Leg_Extensions', 'macchina',
    ['Una gamba alla volta', 'Ampiezza senza dolore', 'Discesa lenta']),
  E('Seated_Leg_Curl', 'Leg curl seduto', 'femorali', 'iso', { femorali: 1 }, 'Lying_Leg_Curls', 'macchina',
    ['Ginocchio allineato al perno', 'Porta i talloni sotto il sedile', 'Torna lento'], { base: true }),
  E('Lying_Leg_Curls', 'Leg curl sdraiato', 'femorali', 'iso', { femorali: 1 }, 'Seated_Leg_Curl', 'macchina',
    ['Bacino premuto sulla panca', 'Porta i talloni verso i glutei', 'Discesa controllata']),
  E('Thigh_Abductor', 'Abductor machine', 'glutei', 'iso', { glutei: 1 }, 'Pull_Through', 'macchina',
    ['Schiena appoggiata', 'Apri le gambe spingendo con l’esterno coscia', 'Chiudi lento'], { base: true }),
  E('Pull_Through', 'Pull through al cavo', 'glutei', 'iso', { glutei: 1, femorali: 0.5 }, 'Thigh_Abductor', 'cavo',
    ['Di spalle al cavo, corda tra le gambe', 'Spingi le anche in avanti stringendo i glutei', 'Schiena dritta']),
  E('Calf_Press_On_The_Leg_Press_Machine', 'Calf alla leg press', 'polpacci', 'core', { polpacci: 1 }, 'Seated_Calf_Raise', 'macchina',
    ['Solo l’avampiede sulla pedana', 'Spingi sulle punte', 'Allunga bene in basso'], { base: true, inc: 5 }),
  E('Seated_Calf_Raise', 'Calf seduto', 'polpacci', 'core', { polpacci: 1 }, 'Calf_Press_On_The_Leg_Press_Machine', 'macchina',
    ['Avampiede sul gradino', 'Sali sulle punte', 'Scendi lento']),

  // Addome
  E('Ab_Crunch_Machine', 'Crunch alla macchina', 'addome', 'core', { addome: 1 }, 'Cable_Crunch', 'macchina',
    ['Arrotola il busto, non tirare con le braccia', 'Espira scendendo', 'Torna lento'], { base: true }),
  E('Cable_Crunch', 'Crunch al cavo', 'addome', 'core', { addome: 1 }, 'Ab_Crunch_Machine', 'cavo',
    ['In ginocchio, corda ai lati della testa', 'Porta i gomiti verso le cosce', 'Anche ferme'], { base: true }),
  E('Plank', 'Plank', 'addome', 'time', { addome: 1 }, 'Dead_Bug', 'corpo',
    ['Gomiti sotto le spalle', 'Corpo dritto, glutei stretti', 'Respira, non trattenere il fiato'], { base: true }),
  E('Dead_Bug', 'Dead bug', 'addome', 'core', { addome: 1 }, 'Plank', 'corpo',
    ['Schiena bassa schiacciata a terra', 'Allunga braccio e gamba opposti', 'Movimento lento']),
  E('Pallof_Press', 'Pallof press', 'addome', 'time', { addome: 1 }, 'Plank', 'cavo',
    ['Di fianco al cavo, maniglia al petto', 'Spingi avanti e resisti alla rotazione', 'Cambia lato a metà'], { base: true }),
];

export const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

export const imgs = id => [`img/ex/${id}_0.jpg`, `img/ex/${id}_1.jpg`];

// Range di ripetizioni e recupero per tipo (documento di ricerca)
export const TYPE_RULES = {
  multi: { min: 8, max: 12, rest: 120 },
  iso:   { min: 10, max: 15, rest: 80 },
  core:  { min: 12, max: 20, rest: 60 },
  time:  { min: 30, max: 45, rest: 60, unit: 's' },
};

// Priorità predefinite (per Giabba)
export const DEFAULT_PRIORITY = {
  petto: 'alta', laterali: 'alta', bicipiti: 'alta', tricipiti: 'alta',
  schiena: 'normale', posteriori: 'normale', addome: 'normale',
  quadricipiti: 'minima', femorali: 'minima', glutei: 'minima', polpacci: 'minima',
};

// Obiettivi di serie nella finestra di 7 giorni, per ciclo
export const TARGETS = {
  alta:    [11, 13, 16],
  normale: [8, 10, 11],
  minima:  [4, 5, 5],
};

// Àncore e complementari predefiniti (documento di ricerca)
export const DEFAULT_PLAN = {
  petto:       { anchor: 'Leverage_Chest_Press', comp: ['Leverage_Incline_Chest_Press', 'Cable_Crossover', 'Butterfly'] },
  laterali:    { anchor: 'Cable_Seated_Lateral_Raise', comp: ['Side_Lateral_Raise'] },
  bicipiti:    { anchor: 'Machine_Bicep_Curl', comp: ['Cable_Hammer_Curls_-_Rope_Attachment', 'Standing_Biceps_Cable_Curl'] },
  tricipiti:   { anchor: 'Triceps_Pushdown_-_Rope_Attachment', comp: ['Cable_Rope_Overhead_Triceps_Extension', 'Dip_Machine'] },
  schiena:     { anchor: 'Wide-Grip_Lat_Pulldown', comp: ['Seated_Cable_Rows', 'Leverage_Iso_Row', 'Close-Grip_Front_Lat_Pulldown'] },
  posteriori:  { anchor: 'Reverse_Machine_Flyes', comp: ['Face_Pull'] },
  addome:      { anchor: 'Ab_Crunch_Machine', comp: ['Cable_Crunch', 'Plank', 'Pallof_Press'] },
  quadricipiti:{ anchor: 'Leg_Press', comp: ['Leg_Extensions'] },
  femorali:    { anchor: 'Seated_Leg_Curl', comp: [] },
  glutei:      { anchor: 'Thigh_Abductor', comp: [] },
  polpacci:    { anchor: 'Calf_Press_On_The_Leg_Press_Machine', comp: [] },
};

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
    { id: 'Machine_Bicep_Curl', sets: 3, ss: 1 },
    { id: 'Triceps_Pushdown_-_Rope_Attachment', sets: 3, ss: 1 },
    { id: 'Ab_Crunch_Machine', sets: 3 },
  ],
  B: [
    { id: 'Leverage_Incline_Chest_Press', sets: 3 },
    { id: 'Seated_Cable_Rows', sets: 3 },
    { id: 'Seated_Leg_Curl', sets: 2 },
    { id: 'Butterfly', sets: 2 },
    { id: 'Reverse_Machine_Flyes', sets: 2, ss: 1 },
    { id: 'Cable_Seated_Lateral_Raise', sets: 2, ss: 1 },
    { id: 'Cable_Hammer_Curls_-_Rope_Attachment', sets: 2, ss: 2 },
    { id: 'Cable_Rope_Overhead_Triceps_Extension', sets: 2, ss: 2 },
    { id: 'Plank', sets: 3 },
  ],
};
