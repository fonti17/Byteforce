# Technische Informationen für die Jury

## Aktueller Stand des Sourcecodes

### Link zu Github Repository

[https://github.com/fonti17/Byteforce](https://github.com/fonti17/Byteforce)

Das Repository enthält unter `code/` die vollständige Frontend-Applikation inklusive Serverless-Proxy-Routen für den Prodega-Katalog. In den Ordnern `documentation/` und `presentation/` liegen Begleitmaterialien und Präsentationsunterlagen.

### Link zur Live-Applikation

[https://byteforce-three.vercel.app/](https://byteforce-three.vercel.app/)

Die Applikation ist öffentlich erreichbar und kann ohne Installation direkt im Browser getestet werden. Details zum Deployment folgen im Abschnitt [Wie ist die Applikation deployed?](#wie-ist-die-applikation-deployed).

## Ausgangslage

### Worauf habt ihr euch fokussiert?

Unser Fokus lag auf «Event in a Box», einem KI-gestützten Catering-Planer, der aus unstrukturierten Freitext-Anfragen automatisch Event-Parameter extrahiert, unvollständige Angaben im Dialog klärt und ein massgeschneidertes Menü samt skalierter Einkaufsliste und Live-Preisen generiert. Zusätzlich ist es möglich eigene Rezepte zu registrieren und diese dann auch in der Menuplanung berücksichtigen zu lassen. Für die Erfassung der Rezepte haben wir erneut die Unterstützung eines Sprachmodells in anspruch genommen und ein Rezept kann mit nur dem Link darauf bereits registriert werden.

### Welche technischen Grundsatzentscheide habt ihr gefällt?

Als Sprachmodell nutzen wir Apertus v1.5 (8B und 70B) über Stoney Cloud und onprem.ai. Damit verbleiben alle Daten vollständig und datenschutzkonform in der Schweiz.

Die Anwendungslogik folgt einer Zwei-Phasen-Architektur: Das schnelle 8B-Modell extrahiert in Part 1 die Rahmendaten aus dem Freitext, während das 70B-Modell in Part 2 für die Menü- und Mengenplanung zuständig ist. Die Steuerlogik und Validierung liegen deterministisch im TypeScript-Code, sodass das LLM rein als Extraktor und Inhaltsgenerator agiert.

## Technischer Aufbau

### Welche Komponenten und Frameworks habt ihr verwendet?

| Komponente | Technologie | Version / Quelle |
|---|---|---|
| Frontend Framework | React mit TypeScript | 19.2 / 6.0 |
| Build Tool | Vite | 8.2 |
| UI & Styling | HeroUI, Tailwind CSS | 3.2 / 4.3 |
| KI-Modelle | Apertus v1.5 (8B und 70B) | onprem.ai / Stoney Cloud |
| Katalog-Schnittstelle | Serverless Proxy API | Live-Anbindung an Prodega |
| Persistenz | IndexedDB | Browser-Store für Rezepte |

### Wozu und wie werden diese eingesetzt?

React und HeroUI bilden das Interface der modularen Single-Page-Applikation. Das Apertus 8B Modell extrahiert strukturierte Parameter wie Datum, Gästezahl und Budget aus Freitexten und übernimmt das Produkt-Matching im Prodega-Katalog. Apertus 70B generiert basierend darauf Menüvorschläge und Einkaufslisten. 

```mermaid
flowchart TD
    subgraph S1["1. Erfassung (Gathering)"]
        User["Freitext-Anfrage"] --> Extraction["Hybride Pipeline (Apertus 8B + Regex)"]
        Extraction --> Check{"Vollständig?"}
        Check -->|"Nein"| FollowUp["Interaktive Nachfragen"] --> Extraction
        Check -->|"Ja"| BriefResult["Validierter Event-Datensatz"]
    end

    subgraph S2["2. Menüplanung"]
        BriefResult --> PlanEngine["Planer (Apertus 70B)"]
        CustomRecipes["Eigene Rezepte (IndexedDB)"] --> PlanEngine
        PlanEngine --> BasePlan["Menüplan & Einkaufsliste"]
    end

    subgraph S3["3. Bepreisung (Pricing)"]
        BasePlan --> ProdegaAPI["Prodega Live-Katalog (Serverless API)"]
        ProdegaAPI --> LLM_Choice["Produkt-Matching (Apertus 8B)"]
        LLM_Choice --> MathEngine["Kosten- & Mengenkalkulation (CHF)"]
        MathEngine --> FinalPlan["Fertiger Catering-Plan"]
    end
```

### Wie ist die Applikation deployed?

Die Applikation läuft als Vercel-Projekt unter [https://byteforce-three.vercel.app/](https://byteforce-three.vercel.app/). Jeder Push auf `main` löst automatisch einen Build aus (`npm run build` mit `code/` als Root-Verzeichnis), ausgeliefert wird das statische Bundle aus `dist/`. Da es sich um eine PWA handelt, lässt sich die Anwendung von dieser URL aus direkt auf Desktop und Mobile installieren.

Das gesamte Deployment-Verhalten ist in `code/vercel.json` deklariert:

| Route | Typ | Zweck |
|---|---|---|
| `/api/transgourmet/search` | Serverless Function | Fragt den Prodega-Live-Katalog serverseitig ab (`maxDuration: 60`) |
| `/api/stoney/*` | Proxy-Rewrite | Weiterleitung an `https://llm.stoney-cloud.com` (Apertus 8B) |
| `/api/onprem/*` | Proxy-Rewrite | Weiterleitung an `https://llm-api2.b.onprem.ai` (Apertus 70B) |
| `/*` (alles Übrige) | SPA-Fallback | Rewrite auf `/index.html` für das clientseitige Routing |

Die beiden Proxy-Rewrites bilden exakt den Vite-Dev-Proxy aus `vite.config.ts` nach. Dadurch funktionieren lokal und in der Produktion dieselben relativen Request-Pfade, ohne dass im Frontend zwischen den Umgebungen unterschieden werden muss. Zweck des Proxys ist die Umgehung der CORS-Restriktionen des Browsers gegenüber den LLM-Hosts; die `VITE_*`-Keys werden beim Build in das Client-Bundle kompiliert und sind daher nicht geheim. Die Katalogsuche läuft demgegenüber vollständig serverseitig in der Serverless Function.

Die Umgebungsvariablen aus `code/.env.example` (Modell-Endpunkte, API-Keys, Default-Modell) werden in den Vercel-Projekteinstellungen hinterlegt; Änderungen werden erst mit einem erneuten Deployment wirksam.

## Implementation

### Gibt es etwas Spezielles, was ihr zur Implementation erwähnen wollt?

Ein spannendes Detail ist die strikte Aufgabenteilung zwischen qualitativer KI-Entscheidung und deterministischer Arithmetik: Bei Zutaten wie Hackfleisch muss zwischen einem günstigen 5-kg-Gastronomie-Gebinde und handlicheren 1-kg-Packungen abgewogen werden. Das Sprachmodell bewertet hierbei qualitativ das Risiko für Food Waste gegenüber dem Kilopreis. Sämtliche mathematischen Berechnungen zu Packungsanzahl, Portionskosten und Restmengen übernimmt jedoch der Code, um Rechenfehler und Verwechslungen von Innen- und Aussenverpackungen durch das LLM auszuschliessen. Hier haben wir viele Fehler und Halluzinationen erhalten, da auf der Prodega Seite die Mengenangaben in etwa 15-20 verschiedenen Bezeichnungen vorkommen (kg, g, bt, be usw.), als weitere Erschwerung steht dann teilweise das Gewicht noch im Titel sprich 1 Karton wird dann als "Champions 250g" benannt.

Zudem setzen wir auf eine effiziente Parallelisierung: Um Wartezeiten bei langen Einkaufslisten zu minimieren, werden Produktkandidaten in einem einzigen Batch-Aufruf aus dem Katalog geladen. Das anschliessende Matching durch Apertus 70B wird parallelisiert mit einer Concurrency von 4 abgearbeitet, wodurch langsame Einzelanfragen den Gesamtprozess nicht blockieren.

### Umsetzung etwas im Detail und Lessons Learned
Nicht alle unserer Entscheidungen waren gut oder haben gefruchtet wie wir uns dies gewünscht hätten. Misserfolge gehören aber dazu und sollten als lessons learned gesehen werden :D

Im Entwicklungsprozess haben wir zwei alternative Wege erprobt und verworfen: einen Webscraper für Zutatenpreise auf der Prodega-Website sowie ein klassisches Datenbank-Lookup für vordefinierte Rezepte. Beide Ansätze erwiesen sich als nicht vielversprechend.

Nach der Erstellung der Einkaufsliste mit verschiedenen Produkten durch das Sprachmodel wollten wir die echten Preise dazu finden. Dafür haben wir einen Webscraper verwendet, der die Prodega-Seite durchsucht und jeweils einen Preis für jedes Produkt zurückgegeen hat. Da dies sehr langsam war haben wir noch eine sqlite-db zur Hilfe genommen, bei Start der Applikation wurde die ganze Website gescraped und alle Artikel ind die DB gespeichert. Auf diesen Weg konnten wir die Geschwindigkeit steigern, das Hauptproblem ist aber geblieben. Wir haben vom Sprachmodell manchmal zu generische und manchmal zu spezifische Bezeichnungen erhalten. Wir haben versucht 100 Produkte mit einem Match im Namen zu nehmen und diese aufgrund von Kategorisierung, Menge und roh-Material oder verarbeitetes Lebensmittel ein besseres Matching zu erhalten. All unsere Anstrengungen führten aber nicht zum Erfolg und es war mehr zufällig ob für schweizer Bier ein "Feldschlösschen" oder ein "Schweizer Apfelessig" vorgeschlagen wurde. Unsere verschiedenen Anstrengungen und bisherigen versuche sind alle auf dem recipe-db Branch zu finden.

Ein weiteres Problem von uns ist die Zeit die das grosse Apertus Model benötigt um ein Menu zu erstellen und dessen Zutaten zusammenzusuchen. Aufgrund dessen haben wir uns mit Rezept-Datenbanken auseinandergesetzt, davon haben wir auch eine themealdb.com angebunden. Auf diese Weise haben wir gehofft das zuvor erwähnte Problem mit zu generisch oder zu spezifischen Produkten zu lösen und zusätzlich noch das Sprachmodel zu entlassten indem es nur noch das Gericht vorschlagen muss und wir die Zutaten dann von der Datenbank nehmen. Es sollte aber in beiden Fällen keine bis geringen Mehrwert bringen, weshalb wir uns dazu entschlossen haben diesen Weg nicht weiter zu verfolgen. Die gemachte Anbindung an die Datenbank und unsere versuche sind aber auf dem Branch recipe-db weiterhin verfügbar.

Als Lösung für die Live-Preise sind wir dann wieder auf die Unterstützung des grossen Apertus Modells zurückgekommen und haben zusätzlich noch etwas Logik selbst eingebaut. Es wird für jeden Eintrag in der Einkaufsliste das Keyword ermittelt und mit diesem ein Fetch-Call auf Prodega gemacht (vorstellbar wie die Such-Funktion auf der Prodega Websie) das Resultat davon geben wir dann dem grossen Apertus Model, welches ermittelt welcher Eintrag am ehesten passt. Mit dieser Wahl wird dann wieder deterministisch die korrekte Menge und Preis berechnet. Das LLM nimmt bisher jeweils den billigsten der passenden Einträge von Prodega, sprich der Preis wird mit eingewichtet.

Eigene Rezepte werden über einen Paste-Workflow hinzugefügt: Ein kopierter Rezepttext wird in der Rezeptverwaltung eingefügt und von Apertus 70B in das definierte Schema mit Name, Portionenzahl, Zutaten, Mengen und Zubereitungsschritten umgewandelt. Der Code validiert und normalisiert die Antwort, zum Beispiel indem «EL», «TL», «dl» und «kg» in unterstützte Einheiten überführt werden.

Fehlen Rezeptname, Portionenzahl oder Zutaten, werden diese Angaben im Dialog oder Editor ergänzt und nicht automatisch erraten. Ist das Sprachmodell nicht erreichbar, verarbeitet ein lokaler Parser typische Texte mit «Zutaten»- und «Zubereitung»-Abschnitten.

Das fertige Rezept wird lokal in IndexedDB gespeichert, mit localStorage und Arbeitsspeicher als Fallback. Bei der Auswahl für ein Event werden die Zutaten auf die Gästezahl skaliert und deterministisch mit der Einkaufsliste zusammengeführt.

### Was ist aus technischer Sicht besonders cool an eurer Lösung?

Hervorzuheben ist der nahtlose «Paste an email»-Workflow, der unformatierte Kunden-E-Mails direkt in strukturierte Event-Daten überführt.

Die Verknüpfung von generativer Menüplanung mit echten Prodega-Katalogdaten schlägt die Brücke zwischen kreativer Konzeption und realer Beschaffung. Die KI trifft fundierte Produktentscheidungen bezüglich Packungsgrössen, während die exakte Kosten- und Restmengenrechnung mathematisch präzise im Code durchgeführt wird.

Wir haben mit dem Scraper und der Rezept-Datenbank hätten wir noch spannende weitere Technologien eingebunden, welche sich leider als nicht lohnenswert herausgestellt haben. Wir benutzen dafür viel ein LLM, was im ersten Moment stumpf und langweilig klingt. Mit json-Konfigurationsfiles haben wir dafür gesorgt jeweils eine sauber strukturierte Antowrt zu erhalten und das Model immer mit der gelichen Struktur als Input zu füttern.

## Abgrenzung / Offene Punkte

### Welche Abgrenzungen habt ihr bewusst vorgenommen und damit nicht implementiert? Weshalb?

Verworfene Ansätze: Der Prodega-Webscraper für Preise und das Datenbank-Lookup für Mahlzeiten wurden zugunsten der direkten Live-API und der flexiblen LLM-Generierung nicht weiterverfolgt.

Scope-Entscheide: Auf Benutzer-Logins und eine zentrale Server-Datenbank wurde verzichtet, da die lokale Browser-Speicherung für den aktuellen Anwendungsfall ausreicht. Der Planer konzentriert sich rein auf Speisen, Getränke und Mengenkalkulation; organisatorische Bereiche wie Raummiete, Dekoration oder Personalplanung wurden bewusst ausgeklammert.

### Weiterentwicklungsmöglichkeiten
Aktuell ist die Erstellung eines Menu inklsuive Einkaufsliste noch zu langsam. Zudem könnte das Mapping auf Prodega-Produkte sicherlich vereinfacht werden mit eine internen API von Prodega. Weiter wäre es sinnvoll aus der fertigen Einkausliste eine CSV-Datei genereiren zu lassen die dann auf der Prodega-Website direkt im Einkaufswagen hochgeladen werden kann und ihn befüllt. Wenn man diesen Case noch weiter denkt, könnte man diesen Punkt noch automatisieren und der Benutzer kann nach dem Planen seines Anlasses direkt mit einem Knopfdruck zum fertigen Einkaufswagen in Prodega gelangen. Um dem Kunden mehr zu helfen könnte man die Geiwchtugn bei der Auswahl der Lebensmittel noch stärker individualisieren, sollen mehr Bio, bessere Qualität oder andere Wünsche berücksichtigt werden. Es gibt also noch viele Möglichkeiten, aber bis jetzt gibt es den POC vom Hackathon. #Bärnhäckt
