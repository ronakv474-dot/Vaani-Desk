// Business config + reply templates. Default: Ramesh Kirana Store (dukaan). Clinic preset tests ke liye.
// Template value: string (text = speak) ya {text, speak}. Speak mein numbers words mein.
(function (root) {
  const hi = {
    intro: 'Namaste, main VaaniDesk hoon, {business} ka AI assistant.',
    greeting: 'Main appointment, timing, fees aur address mein madad kar sakta hoon. Boliye?',
    askSlot: 'Kis din aur kitne baje aana chahenge?',
    askNewSlot: 'Kis din aur kitne baje karna hai?',
    confirm: '{when}, {doctor} ke saath. Sahi hai?',
    offer: '{reason} {when} khaali hai, {doctor} ke saath. Chalega?',
    reasonTaken: '{reqWhen} ka slot bhar chuka hai.',
    reasonClosed: '{dayName} ko clinic band rehta hai.',
    reasonHours: 'Clinic {open} se {close} tak khula rehta hai.',
    reasonPast: 'Wo time nikal chuka hai.',
    reasonNone: '',
    booked: 'Ho gaya! Aapki appointment {when} pakki hai. Dhanyavaad.',
    rescheduleConfirm: 'Aapki {oldWhen} wali appointment {when} kar doon? Sahi hai?',
    rescheduled: 'Ho gaya! Aapki appointment ab {when} hai.',
    cancelConfirm: '{oldWhen} wali appointment cancel kar doon? Sahi hai?',
    cancelled: 'Aapki appointment cancel ho gayi.',
    cancelKept: 'Theek hai, appointment waise hi rahegi.',
    noBooking: 'Aapki koi booking nahi mili. Nayi appointment ke liye din aur time boliye.',
    declined: 'Theek hai. Kaunsa din aur time chahiye?',
    timing: 'Hum {open} se {close} tak khule rehte hain. {closedDay} ko chhutti hoti hai.',
    fees: 'Consultation fees {fees} rupaye hai.',
    address: 'Hamara pata hai: {address}.',
    closed: '{closedDay} ko band rehta hai. Baaki din {open} se {close} tak khula hai.',
    emergency: {
      text: 'Ye emergency lagti hai. Turant 108 ya 112 pe call karein. Main owner ko abhi alert bhej raha hoon.',
      speak: 'Ye emergency lagti hai. Turant ek sau aath ya ek sau baarah pe call karein. Main owner ko abhi alert bhej raha hoon.',
    },
    medical: 'Main medical salah nahi de sakta. Kripya doctor se milein.',
    discount: 'Daam ya discount ke baare mein main koi wada nahi kar sakta. Main owner ko message de deta hoon.',
    unknown: 'Maaf kijiye, main samjha nahi. Main owner ko message de deta hoon, woh aapko call karenge.',
    orderCallback: 'Main owner ko aapka message de deta hoon, woh aapko call karenge.',
    repeatConfirm: 'Maaf kijiye, haan ya nahi boliye. {question}',
    yesIdle: 'Ji, boliye, kya madad karoon?',
    bye: 'Theek hai. Dhanyavaad!',
    ownerHelp: "Udhaari likhne ke liye boliye, jaise 'Sharma ji ke do hazaar baaki'.",
    ledgerAdded: 'Likh liya: {name}, {amount} rupaye baaki. {name} ka kul baaki {due} rupaye.',
    ledgerPaid: 'Theek hai: {name} ne {amount} rupaye diye. Ab baaki {due} rupaye.',
    ledgerQuery: '{name} ka kul baaki {due} rupaye hai.',
    ledgerNeedAmount: 'Naam aur amount dono boliye, jaise Sharma ji ke do hazaar baaki.',
    ledgerNoDue: '{name} ka koi baaki nahi hai.',
  };
  const ta = {
    intro: 'வணக்கம், நான் VaaniDesk, {business} AI உதவியாளர்.',
    greeting: 'நான் எப்படி உதவலாம்?',
    confirm: '{when}, {doctor} உடன். சரியா?',
    booked: 'முன்பதிவு உறுதி. {when}, {doctor} உடன். நன்றி!',
    timing: 'நாங்கள் {open} முதல் {close} வரை திறந்திருக்கும். {closedDay} விடுமுறை.',
    emergency: 'இது அவசரம் போல் தெரிகிறது. உடனே 108 அல்லது 112 அழைக்கவும்.',
  };
  const shop = { name: 'Ramesh Kirana Store' };
  const filler = 'Ji, ek second.';
  const reminders = {
    soft: {
      text: 'Namaste {name}, {shop} ki taraf se ek chhoti si yaad: aapke {amount} rupaye baaki hain. Jab suvidha ho, de dijiyega. Dhanyavaad!',
      speak: 'Namaste {name}, {shop} ki taraf se ek chhoti si yaad. Aapke {amount} rupaye baaki hain. Jab suvidha ho, de dijiyega. Dhanyavaad!',
    },
    normal: {
      text: 'Namaste {name}, {shop} se: aapke {amount} rupaye baaki hain. Kripya is hafte tak jama kar dein. Dhanyavaad.',
      speak: 'Namaste {name}, {shop} se. Aapke {amount} rupaye baaki hain. Kripya is hafte tak jama kar dein. Dhanyavaad.',
    },
    footer: '(Ye message AI se bana hai. Aise message nahi chahiye to STOP likhein.)',
  };

  const clinic = {
    business: {
      name: 'Dr. Meena Clinic', nameSpeak: 'Doctor Meena Clinic', type: 'clinic', bookings: true,
      doctor: 'Dr. Meena', doctorSpeak: 'Doctor Meena', open: '10:00', close: '19:00', closedDay: 0,
      slotMinutes: 15, fees: 500, address: 'Shop 12, Gandhi Chowk, Civil Lines', phone: '+91 90000 00000',
    },
    shop, filler, reminders,
    templates: { hi: Object.assign({}, hi, { timing: 'Clinic {open} se {close} tak khula rehta hai. {closedDay} ko chhutti hoti hai.', closed: '{closedDay} ko clinic band rehta hai. Baaki din {open} se {close} tak khula hai.', address: 'Clinic ka pata hai: {address}.' }), ta },
  };

  const config = {
    business: {
      name: 'Ramesh Kirana Store', nameSpeak: 'Ramesh Kirana Store', type: 'shop', bookings: false, owner: 'Ramesh',
      doctor: 'Ramesh ji', doctorSpeak: 'Ramesh ji', open: '08:00', close: '21:00', closedDay: 2,
      slotMinutes: 15, fees: 0, address: 'Dukaan 4, Main Bazaar, Sadar', phone: '+91 90000 00000',
    },
    shop, filler, reminders,
    templates: {
      hi: Object.assign({}, hi, {
        greeting: 'Main dukaan ki timing, pata, aur order ka message le sakta hoon. Boliye?',
        fees: 'Saamaan ke daam ke liye main Ramesh ji ko message de deta hoon, woh aapko batayenge.',
        orderCallback: 'Order ya home delivery ke liye main Ramesh ji ko message de deta hoon. Woh aapko jaldi call karenge.',
      }),
      ta,
    },
    clinic,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.VaaniConfig = config;
})(typeof window !== 'undefined' ? window : globalThis);
