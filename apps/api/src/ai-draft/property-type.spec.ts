import { describe, expect, it } from "vitest";
import { classifyPropertyType, propertyTypeFromTitle } from "./archive-text.js";

/** Lines as they are written in this office's sale deeds (names / numbers made up). */
describe("archive property type (rules v2)", () => {
  it("the title decides when it says the type", () => {
    expect(propertyTypeFromTitle("भवन/मकान री सेल — वार्ड 12")).toBe("building");
    expect(propertyTypeFromTitle("मकान विक्रय पत्र")).toBe("building");
    expect(propertyTypeFromTitle("प्लाट नं. 47 फ्लोरा सिटी")).toBe("plot");
    expect(propertyTypeFromTitle("भूखण्ड क्र. 9 रामायण नगर")).toBe("plot");
    expect(propertyTypeFromTitle("कृषि भूमि ग्राम अलापुर")).toBe("agricultural");
    expect(propertyTypeFromTitle("फ्लैट नं. 202 सनराइज़ अपार्टमेंट")).toBe("flat");
    expect(propertyTypeFromTitle("विक्रय पत्र 2025-41")).toBeNull();
    // A building title wins even when the text has सर्वे क्रमांक / हेक्टेयर.
    expect(classifyPropertyType("ग्राम सिरोल सर्वे क्रमांक 112 रकबा 1.20 हेक्टेयर में से", "भवन/मकान री सेल")).toBe("building");
  });

  it("colony plot with सर्वे क्रमांक / हेक्टेयर is a plot, not agricultural", () => {
    const colony = `ग्राम सिरोल तहसील ग्वालियर जिला ग्वालियर स्थित सर्वे क्रमांक 245, 246 कुल रकबा 2.150 हेक्टेयर भूमि पर विकसित फ्लोरा सिटी कॉलोनी में
प्लाट क्रमांक 47 क्षेत्रफल 30 x 50 = 1500 वर्गफुट (139.35 वर्गमीटर) खुला भूखण्ड है।
जिसकी चतुःसीमा -
पूर्व - मकान श्री हरिप्रसाद का
पश्चिम - 30 फुट रोड`;
    expect(classifyPropertyType(colony)).toBe("plot");
    // No plot word, only an area cut from a survey number.
    expect(classifyPropertyType("सर्वे क्रमांक 77 रकबा 0.418 हेक्टेयर में से 1200 वर्गफुट भूमि का अंश विक्रय किया")).toBe("plot");
  });

  it("diverted colony land: its old कृषि भूमि words do not make it agricultural", () => {
    const d = "सर्वे क्रमांक 310 की कृषि भूमि जो आवासीय प्रयोजन हेतु व्यपवर्तित है, उस पर स्थित प्लाट क्रमांक 12 क्षेत्रफल 800 वर्गफुट";
    expect(classifyPropertyType(d)).toBe("plot");
  });

  it("a right to build later is not a building; a built house is", () => {
    expect(classifyPropertyType("प्लाट क्रमांक 5 क्षेत्रफल 1000 वर्गफुट। क्रेता उक्त प्लाट पर मकान बना सकेगा।")).toBe("plot");
    expect(classifyPropertyType("प्लाट क्रमांक 5 पर भवन निर्माण की अनुमति नगर निगम से क्रेता स्वयं लेगा।")).toBe("plot");
    expect(classifyPropertyType("प्लाट क्रमांक 5 पर निर्मित दो मंजिला पक्का मकान, जिसका नामांतरण क्रेता करा सकेगा।")).toBe("building");
    expect(classifyPropertyType("भूखण्ड पर निर्मित आर.सी.सी. छत की दुकान")).toBe("building");
  });

  it("the parties' addresses and the boundaries are not this property", () => {
    const d = `विक्रेता श्री रामलाल पुत्र श्री किशनलाल निवासी मकान नं. 12 नई सड़क लश्कर, ग्वालियर
विक्रीत सम्पत्ति - प्लाट क्रमांक 18 क्षेत्रफल 600 वर्गफुट
जिसकी चतुःसीमा उत्तर में मकान श्री सोहन का, दक्षिण में भवन श्री मोहन का।`;
    expect(classifyPropertyType(d)).toBe("plot");
    expect(classifyPropertyType("कृपया ध्यान दें — मेसर्स सिटी डेवलपर्स द्वारा निर्मित कॉलोनी में प्लाट क्रमांक 3")).toBe("plot");
  });

  it("agricultural: real farm words, or hectare when nothing else is said", () => {
    expect(classifyPropertyType("ग्राम अलापुर की असिंचित भूमि सर्वे क्रमांक 45 रकबा 0.250 हेक्टेयर")).toBe("agricultural");
    expect(classifyPropertyType("खसरा नंबर 88 रकबा 1.05 हेक्टेयर")).toBe("agricultural");
    expect(classifyPropertyType("सर्वे क्रमांक 45 ग्राम अलापुर")).toBeNull();
  });
});
