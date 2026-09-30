# NSK deed drafting pattern — derived on the server from all 8,567 office deeds
# (5,640 sale deeds). Only phrasing seen in >= 25 deeds; no personal data.

## Deed types in the archive (count)
sale-deed 5640, agreement 1255, equitable-mortgage-deed 738, reconveyance-deed 186,
power-of-attorney 169, will-deed 150, lease-deed 142, amendment-deed 123,
release-deed 88, gift-deed 64, partition-deed 12

## Party description (most common forms, in order of frequency)
- "श्री [नाम] पुत्र श्री [पिता का नाम]"                         (1072)
- "श्री [नाम] पुत्र श्री [पिता का नाम] (आधार नं. ...)"            (939)
- "क्रेता पक्ष - श्री [नाम] पुत्र श्री [पिता का नाम] (आधार नं. ...)" (384)
- "विक्रेता पक्ष - श्री [नाम] पुत्र श्री [पिता का नाम] (आधार नं. ...)" (327)
- women: "श्रीमती [नाम] पत्नी श्री [पति का नाम]"
- PAN written as "(पेन नं. ...)" or "(Pan No. ...)" after Aadhaar
So: honorific + name + relation word (पुत्र / पुत्री / पत्नी) + honorific + father/husband name,
then "(आधार नं. XXXX XXXX XXXX)" and optionally "(पेन नं. ...)". Party blocks are headed
"विक्रेता पक्ष -" and "क्रेता पक्ष -".

## Sale-deed skeleton phrases (frequency)
- title "विक्रय पत्र" (2149) / "विक्रय विलेख" (2048)
- "विक्रीत सम्पत्ति का विवरण" (2355)
- "जिसकी चतुःसीमा निम्न प्रकार है" (1746)
- plot: "प्लाट क्रमांक - #" (1157); "क्षेत्रफल - # फुट x # फुट होकर # वर्गफुट यानी # वर्गमीटर है" (1211)
- agricultural: "सर्वे क्रमांक - # ग्राम ..." (1046); "विक्रीत की गयी कृषि भूमि का विवरण निम्नानुसार है" (876)
- "अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है" (2467)
- closing: "इति दिनांक #" (2068)

## Rules for WhatsApp prefill
- Build party text in exactly the forms above (not "S/o", not English).
- If the customer typed "X पुत्र श्री Y" inside the name, split it: name = X, relation = पुत्र, father = Y.
- Area: write both units like the office does (sqft and sqm) when the deed is a plot.
- Never invent chaturseema (boundaries), khasra or amounts: leave the office placeholder for staff.
