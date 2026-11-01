# Quickstart 015
1. Collega il tool a **UAT** (o a un ambiente dove le solution sono managed). L'elenco parte sulla vista Managed e sopra la tabella c'è la nota con il nome dell'ambiente, «atteso in UAT o PROD» e «open the tool on a connection to … usually DEV, in another tool tab».
2. Passa su **Unmanaged**: la nota sparisce e compare l'elenco vuoto con l'invito a cambiare tipo. Passa su **All**: la nota torna.
3. Passa il mouse su una riga: tooltip «Managed: …». Apri la solution: il banner nomina l'ambiente, dice che è normale, dice di aprire il tool con una connessione a DEV (altra scheda) e di importare lì il package. Non c'è il pulsante «Set the suffix».
4. Collega il tool a **DEV**: con solo unmanaged non compare nessuna nota; con anche managed, la nota compare solo nella vista Managed e rimanda a Unmanaged; nella vista All le managed hanno il testo attenuato.
5. Prova tema chiaro e scuro.

**Non coperto dai test**: l'aspetto reale (attenuazione, bordo e colore della nota, tema chiaro e scuro) (il testo sulle schede è stato verificato su PPTB il 2026-11-01: DEV e UAT si aprono in due schede).
