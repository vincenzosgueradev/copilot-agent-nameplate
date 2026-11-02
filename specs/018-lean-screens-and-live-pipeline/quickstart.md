# Quickstart 018

1. Passo Suffix con due Target spuntati, poi **Review**: niente elenco di agent e niente selettore `[DEV] [TEST] [PROD]`; una tabella con una riga per package e le opzioni. Con un nome oltre i 30 caratteri compare una riga di avviso con il Target.
2. **Build the package** con la versione da alzare: il popup ha l'icona nell'intestazione, tre righe con icona (ambiente, solution, versione), due note con icona (ambito, come tornare indietro) e la tabella dei package con l'icona dell'archivio sui file.
3. Lascia vuoto il suffisso su un Target non marcato: il popup «un Target senza suffisso» è breve e ha l'icona.
4. Durante l'export: passi numerati, quello in corso più grande e pulsante, la linea che si riempie, la spunta sui passi fatti, i secondi che scorrono.
5. Con «riduci animazioni» attivo nel sistema operativo: niente pulsazione, ma i passi cambiano stato.
6. Passa in rassegna Suffix, Anteprima, Controlli, Risultato: nessun fatto ripetuto due volte.

**Non coperto dai test**: tutto l'aspetto (icone, spaziature, animazioni, tema chiaro e scuro) e il comportamento di `prefers-reduced-motion` nell'host.
