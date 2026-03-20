# VårdKö -- GDPR-dokumentation

> Senast uppdaterad: 2026-03-20
> Version: 1.0
> Ansvarig: Dataskyddsombud (se kontaktuppgifter nedan)

---

## Innehåll

1. [Inledning](#1-inledning)
2. [Personuppgifter som INTE lagras](#2-personuppgifter-som-inte-lagras)
3. [Data som lagras](#3-data-som-lagras)
4. [Rättslig grund](#4-rättslig-grund)
5. [Tekniska skyddsåtgärder](#5-tekniska-skyddsåtgärder)
6. [Datasubjektets rättigheter](#6-datasubjektets-rättigheter)
7. [Dataminimering](#7-dataminimering)
8. [Databehandlingsöversikt](#8-databehandlingsöversikt)
9. [Incidenthantering](#9-incidenthantering)
10. [Kontaktuppgifter](#10-kontaktuppgifter)

---

## 1. Inledning

VårdKö är ett digitalt köhanteringssystem utformat för svenska vårdcentraler och kliniker. Systemet hanterar patientköer i realtid, med fokus på integritet och dataminimering i enlighet med EU:s dataskyddsförordning (GDPR, förordning 2016/679).

Denna dokumentation beskriver hur VårdKö behandlar personuppgifter, vilka tekniska och organisatoriska åtgärder som vidtagits för att skydda dem, samt vilka rättigheter registrerade personer har.

### Grundprinciper

VårdKö är byggt enligt principen **Privacy by Design** (artikel 25 GDPR):

- **Dataminimering**: Personnummer lagras aldrig -- varken i databasen, i loggar eller i API-trafik.
- **Ändamålsbegränsning**: All data behandlas enbart för köhantering och verksamhetsstatistik.
- **Lagringsbegränsning**: Data raderas automatiskt efter sin ändamålsperiod.
- **Integritet och konfidentialitet**: Kryptering i transit och i vila, rollbaserad åtkomstkontroll.

---

## 2. Personuppgifter som INTE lagras

### Personnummer (personnummer/samordningsnummer)

VårdKö lagrar **aldrig** personnummer i klartext. Processen är utformad så att personnumret aldrig lämnar patientens webbläsare:

#### HMAC-hashning

1. Patienten matar in sitt personnummer i webbläsaren.
2. Personnumret valideras lokalt med Luhn-algoritmen (klient-sida).
3. En HMAC-SHA256-hash beräknas med klinikens dagliga salt.
4. **Enbart hashen** skickas till servern som `anonymousHash`.
5. Personnumret i klartext kasseras omedelbart i webbläsaren.

```
personnummer (klartext)
        |
        v
   [Luhn-validering]  <-- klient-sida, inget nätverksanrop
        |
        v
   HMAC-SHA256(personnummer, dagligt_salt)
        |
        v
   anonymousHash (64 tecken hex)  -->  skickas till server
        |
   personnummer = null  <-- raderas ur minnet
```

#### Daglig saltrotation

- Varje klinik har ett unikt `dailySalt` som roteras automatiskt varje dag.
- Fältet `dailySaltDate` i kliniktabellen spårar senaste rotationsdatumet.
- Hasharna från föregående dag kan **inte** användas för att identifiera patienter nästa dag.
- Detta innebär att en eventuellt läckt hash är värdelös redan dagen efter.

#### Klient-sida-bearbetning

All personnummerbearbetning sker i patientens webbläsare:

- Formatering (t.ex. `19850101-1234`)
- Luhn-validering
- HMAC-hashning

Servern ser aldrig personnumret. Det finns ingen endpoint som tar emot personnummer i klartext.

---

## 3. Data som lagras

### 3.1 Anonymiserade köstatistik

Aggregerad statistik per klinik, datum och timme:

| Fält | Beskrivning |
|------|-------------|
| `total_patients` | Antal patienter i kön under timmen |
| `avg_service_time_seconds` | Genomsnittlig behandlingstid |
| `median_service_time_seconds` | Medianbehandlingstid |
| `p90_service_time_seconds` | 90:e percentilen behandlingstid |
| `avg_wait_time_seconds` | Genomsnittlig väntetid |
| `max_wait_time_seconds` | Maximal väntetid |
| `rooms_available` | Antal tillgängliga rum |
| `no_show_count` | Antal uteblivna |
| `postpone_count` | Antal uppskjutna |

Denna data innehåller **inga personuppgifter**. Den är aggregerad per timme och kan inte kopplas till enskilda individer.

### 3.2 Personaluppgifter

Följande uppgifter lagras om personal (vårdgivare och administratörer):

| Fält | Beskrivning | Rättslig grund |
|------|-------------|----------------|
| `email` | E-postadress | Berättigat intresse + samtycke |
| `display_name` | Visningsnamn | Berättigat intresse |
| `role` | Roll (org_admin, clinic_admin, staff) | Berättigat intresse |
| `password_hash` | Argon2-hashat lösenord | Berättigat intresse |
| `preferred_language` | Språkpreferens | Samtycke |
| `is_active` | Kontostatus | Berättigat intresse |
| `last_login_at` | Senaste inloggning | Berättigat intresse |

### 3.3 Revisionsloggar (audit logs)

Varje åtgärd i systemet loggas med:

| Fält | Beskrivning |
|------|-------------|
| `actor_type` | Typ av aktör (staff, patient, system, admin, superadmin) |
| `actor_id` | Aktörens identifierare (anonymiserad för patienter) |
| `action` | Utförd åtgärd (t.ex. `room.created`, `staff.updated`) |
| `resource_type` | Typ av resurs som påverkades |
| `resource_id` | Resursens identifierare |
| `ip_hash` | SHA-256-hash av IP-adressen (aldrig klartext) |
| `metadata` | Ytterligare kontextuell information (JSON) |
| `timestamp` | Tidstämpel med tidszon |

### 3.4 Köbiljetter (queue tickets)

Aktiva köbiljetter innehåller:

| Fält | Personuppgift? | Beskrivning |
|------|---------------|-------------|
| `anonymous_hash` | Nej (irreversibel hash) | HMAC-hash av personnummer |
| `ticket_number` | Nej | Biljettnummer (t.ex. 42) |
| `session_token` | Nej (kryptografisk token) | 128 tecken slumpmässig hex |
| `status` | Nej | Biljettstatus |
| `language` | Nej | Valt språk (sv/en/ar/fa/so) |
| `position` | Nej | Plats i kön |

Köbiljetter innehåller **inga direkta personuppgifter**. `anonymous_hash` kan inte reverseras och roteras dagligen.

---

## 4. Rättslig grund

### 4.1 Berättigat intresse (artikel 6.1.f)

Köhantering utgör ett berättigat intresse för vårdgivaren:

- **Ändamål**: Effektiv patienthantering, minskade väntetider, optimerad resursanvändning.
- **Nödvändighet**: Köhantering kräver identifiering av unika platser i kön.
- **Balanstest**: Patientens integritet skyddas genom anonymisering (HMAC-hashning av personnummer, daglig saltrotation). Kvarvarande data (statistik) är helt avidentifierad.

### 4.2 Samtycke (artikel 6.1.a)

Samtycke inhämtas för:

- **Personalregister**: Anställdas personuppgifter (namn, e-post) lagras med medarbetarens samtycke vid kontoskapande.
- **Språkpreferenser**: Personalens språkval lagras med samtycke.

### 4.3 Rättslig förpliktelse (artikel 6.1.c)

- **Revisionsloggar**: Loggar för spårbarhet och kvalitetssäkring i hälso- och sjukvård (patientdatalagen, PDL).

---

## 5. Tekniska skyddsåtgärder

### 5.1 Kryptering i transit

- **TLS 1.3** för all HTTP- och WebSocket-trafik.
- Inga okrypterade anslutningar accepteras i produktion.
- HSTS-header aktiverad.

### 5.2 Kryptering i vila

- **AES-256** kryptering av databas på disk (PostgreSQL transparent data encryption).
- Krypterade backuper.

### 5.3 Databasåtkomstkontroll

- **PostgreSQL Row-Level Security (RLS)**: Varje databasfråga begränsas automatiskt till den aktuella organisationens och klinikens data.
- Tenant-kontext sätts per transaktion via `set_config('app.current_organization_id', ...)`.
- Ingen klinik kan se en annan kliniks data, även vid programmeringsfel.

### 5.4 Autentisering och auktorisering

- **JWT med korta livstider**: Access tokens gäller i 15 minuter.
- **Refresh token rotation**: Varje refresh ger ny access token + ny refresh token. Gamla refresh tokens ogiltigförklaras.
- **Argon2-hashning** av lösenord (minneskrävande hashfunktion, motverkar brute force).
- **TOTP (tvåfaktorsautentisering)** för superadmin-konton.
- **Rollbaserad åtkomstkontroll (RBAC)** med fem nivåer: superadmin, org_admin, clinic_admin, staff, patient.

### 5.5 Hastighetsbegränsning (rate limiting)

| Endpoint | Max förfrågningar | Tidsperiod |
|----------|-------------------|------------|
| Inloggning | 5 | 60 sekunder |
| Köanslutning | 10 | 60 sekunder |
| Köstatus | 60 | 60 sekunder |
| Personalåtgärder | 30 | 60 sekunder |
| Admin-endpoints | 60 | 60 sekunder |

### 5.6 Kontospärr

- Efter 5 felaktiga inloggningsförsök spärras kontot i 15 minuter.

---

## 6. Datasubjektets rättigheter

### 6.1 Rätt till åtkomst (artikel 15)

- **Personal**: Kan begära utdrag av alla lagrade uppgifter via dataskyddsombudet.
- **Patienter**: Eftersom inga personuppgifter lagras (personnumret hashas irreversibelt) finns det i praktiken ingen patientdata att ge tillgång till. Patienten informeras om detta.

### 6.2 Rätt till radering (artikel 17)

- **Personal**: Konton kan avaktiveras och personuppgifter raderas på begäran. Revisionsloggar som rör patientsäkerhet behålls i avidentifierad form.
- **Patienter**: Köbiljetter kan raderas av patienten (lämna kön). Hash-värden roteras dagligen och blir oanvändbara.

### 6.3 Rätt till dataportabilitet (artikel 20)

- **Personal**: Personaluppgifter kan exporteras i maskinläsbart format (JSON/CSV).
- **Patienter**: Inte tillämpligt, inga personuppgifter lagras.

### 6.4 Rätt till rättelse (artikel 16)

- **Personal**: E-post och visningsnamn kan uppdateras av administratören eller den anställde.

### 6.5 Rätt att invända (artikel 21)

- Registrerade kan invända mot behandling baserad på berättigat intresse. Invändningen prövas av dataskyddsombudet.

---

## 7. Dataminimering

### 7.1 Personnummer

- Personnumret hashas klient-sida med HMAC-SHA256.
- Hashen används enbart för att förhindra dubbletter i kön.
- Klartext-personnumret raderas ur webbläsarminnet omedelbart efter hashning.
- Daglig saltrotation gör gårdagens hashar oanvändbara.

### 7.2 IP-adresser

- IP-adresser lagras aldrig i klartext.
- All IP-loggning sker via SHA-256-hashning (`hashIpAddress`).
- Hashade IP-adresser används enbart i revisionsloggar.

### 7.3 Köbiljetter

- Biljetter innehåller inga direkta personuppgifter.
- Session tokens är kryptografiskt slumpmässiga (64--128 byte hex), inte kopplade till identitet.
- Avslutade biljetter aggregeras till anonymiserad statistik och raderas.

### 7.4 Sessiontokens

- Genereras med `crypto.randomBytes(64)`.
- Har ingen koppling till personnummer eller andra identifierare.
- Upphör att gälla efter 24 timmar.

---

## 8. Databehandlingsöversikt

| Data | Ändamål | Lagringstid | Skyddsåtgärd |
|------|---------|-------------|--------------|
| Personnummer (klartext) | Validering | Aldrig lagrad (klient-sida) | HMAC-hashning, omedelbar radering |
| Personnummer-hash (`anonymous_hash`) | Förhindra dubbletter i kön | Biljettens livstid (max 24h), sedan aggregerad | HMAC-SHA256, daglig saltrotation |
| Session token | Patientautentisering | Max 24 timmar | Kryptografiskt slumpmässig (128 hex), TLS |
| Köstatistik | Väntetidsprediktion, verksamhetsanalys | 12 månader | Helt avidentifierad, RLS |
| Personaluppgifter (namn, e-post) | Kontoadministration, åtkomstkontroll | Anställningstid + 30 dagar | AES-256, RLS, Argon2 (lösenord) |
| Lösenord | Autentisering | Anställningstid | Argon2-hashning (aldrig klartext) |
| Revisionsloggar | Spårbarhet, kvalitetssäkring | 24 månader | IP-hashning, RLS, tidsstämpling |
| IP-hash | Missbruksdetektering | 24 månader (i revisionslogg) | SHA-256-hashning |
| JWT access token | API-autentisering | 15 minuter | HS256-signering, TLS |
| JWT refresh token | Tokenförnyelse | 7 dagar | HS256-signering, rotation, TLS |
| WebSocket-anslutningar | Realtidsuppdateringar | Sessionslängd | Heartbeat-timeout (90s), TLS |

---

## 9. Incidenthantering

### 9.1 Definition av personuppgiftsincident

En personuppgiftsincident enligt artikel 4.12 GDPR innefattar:
- Obehörig åtkomst till personuppgifter.
- Oavsiktlig eller olaglig förstöring, förlust eller ändring.
- Obehörigt utlämnande av personuppgifter.

### 9.2 Process vid dataintrång

1. **Upptäckt och registrering** (0--1 timme)
   - Incidenten upptäcks via systemövervakning, revisionsloggar, eller anmälan.
   - Incidentansvarig utses omedelbart.

2. **Bedömning** (1--4 timmar)
   - Typ och omfattning av incidenten bedöms.
   - Berörda personuppgifter identifieras.
   - Risknivå för registrerade bedöms.

3. **Begränsning** (omedelbart)
   - Åtkomst till påverkade system begränsas.
   - Komprometterade token ogiltigförklaras.
   - Berörda dagliga salt roteras omedelbart.

4. **Anmälan till Integritetsskyddsmyndigheten (IMY)** (inom 72 timmar)
   - Om incidenten sannolikt medför risk för registrerade: anmälan till IMY.
   - Dokumentation av incidenten, åtgärder och bedömning.

5. **Information till registrerade** (utan onödigt dröjsmål)
   - Om incidenten sannolikt medför hög risk: registrerade informeras direkt.
   - Tydlig beskrivning av incidenten, möjliga konsekvenser och vidtagna åtgärder.

6. **Efteranalys och förbättring** (1--2 veckor)
   - Rotorsaksanalys genomförs.
   - Tekniska och organisatoriska åtgärder uppdateras.
   - Incidentrapporten arkiveras.

### 9.3 Riskbedömning specifik för VårdKö

Tack vare VårdKös dataminimeringsstrategi är risken vid en eventuell dataläcka begränsad:

| Scenario | Risk | Motivering |
|----------|------|------------|
| Databasläcka | **Låg** | Inga personnummer lagras. Hashar kan inte reverseras. Daglig saltrotation begränsar exponering. |
| JWT-läcka | **Medel** | Access tokens gäller max 15 minuter. Refresh tokens roteras. |
| Session token-läcka | **Låg** | Tokens är inte kopplade till identitet. Gäller max 24 timmar. |
| Personaldata-läcka | **Medel** | Namn och e-post exponeras. Lösenord är Argon2-hashade. |

---

## 10. Kontaktuppgifter

### Dataskyddsombud (DPO)

| | |
|---|---|
| **Namn** | _[Tillsätt dataskyddsombud]_ |
| **E-post** | dpo@_[organisation]_.se |
| **Telefon** | _[Telefonnummer]_ |
| **Adress** | _[Gatuadress, postnummer, ort]_ |

### Personuppgiftsansvarig

| | |
|---|---|
| **Organisation** | _[Organisationsnamn]_ |
| **Organisationsnummer** | _[Org.nr]_ |
| **Adress** | _[Gatuadress, postnummer, ort]_ |

### Integritetsskyddsmyndigheten (IMY)

| | |
|---|---|
| **Webbplats** | [https://www.imy.se](https://www.imy.se) |
| **E-post** | imy@imy.se |
| **Telefon** | 08-657 61 00 |
| **Adress** | Drottninggatan 29, 5:e våningen, Box 8114, 104 20 Stockholm |

---

_Detta dokument granskas och uppdateras minst årligen eller vid väsentliga ändringar i systemet._
