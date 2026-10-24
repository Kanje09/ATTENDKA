// RFID Time In System
// ESP32 + PN5180 + I2C 16x2 LCD + active buzzer (high-level trigger)
// Libraries: PN5180 (ATrappmann), LiquidCrystal I2C (Frank de Brabander)

#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <time.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <PN5180.h>
#include <PN5180ISO14443.h>

// ---------- WiFi (EDIT THESE) ----------
const char *WIFI_SSID = "KanJ";
const char *WIFI_PASS = "1234567811";

// Set this to the computer's LAN IP and the key
// returned when this reader is created through the admin API.
const char *API_URL = "http://YOUR_COMPUTER_LAN_IP:5000/api/scan";
const char *HEARTBEAT_URL = "http://YOUR_COMPUTER_LAN_IP:5000/api/reader/heartbeat";
const char *DEVICE_KEY = "PASTE_READER_DEVICE_KEY_HERE";

// ---------- Pins ----------
#define RFID_NSS 5
#define RFID_BUSY 16
#define RFID_RST 17
#define BUZZER_PIN 27 // HIGH = on

// ---------- Time (Philippines, UTC+8) ----------
const long GMT_OFFSET_SEC = 8 * 3600;
const int DST_OFFSET_SEC = 0;

// ---------- Buzzer lengths (ms) ----------
const int BEEP_KNOWN_MS = 500;   // registered card: one long beep
const int BEEP_UNKNOWN_MS = 500; // unknown card: 5 short beeps
const int BEEP_READY_MS = 150;   // startup beep

LiquidCrystal_I2C lcd(0x27, 16, 2); // use 0x3F if the screen stays blank
PN5180ISO14443 nfc(RFID_NSS, RFID_BUSY, RFID_RST);

String lastShown = "";
String lastUid = "";
unsigned long lastLogTime = 0;
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 20000;
bool heartbeatSent = false;

void showLCD(String line1, String line2)
{
  String combined = line1 + "|" + line2;
  if (combined == lastShown)
    return;
  lastShown = combined;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void beep(int ms)
{
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepKnown()
{
  beep(BEEP_KNOWN_MS);
}

void beepUnknown()
{
  for (int i = 0; i < 5; i++)
  {
    beep(BEEP_UNKNOWN_MS) ;
    delay(80);
  }
}

void connectWiFi()
{
  showLCD("Connecting WiFi", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000)
  {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED)
  {
    showLCD("WiFi connected", "Syncing time...");
    configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, "pool.ntp.org", "time.nist.gov");
    struct tm t;
    getLocalTime(&t, 10000);
  }
  else
  {
    showLCD("No WiFi", "Time unavailable");
    delay(2000);
  }
}

String scanCard(const String &uid)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return "offline";
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, API_URL))
  {
    return "connection_error";
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  const String payload = "{\"card_uid\":\"" + uid + "\"}";
  const int statusCode = http.POST(payload);
  const String response = statusCode > 0 ? http.getString() : "";
  http.end();

  if (response.indexOf("\"result\":\"reader_paused\"") >= 0)
    return "reader_paused";

  if (statusCode < 200 || statusCode >= 300)
  {
    Serial.printf("Attendance API HTTP error: %d %s\n", statusCode, response.c_str());
    return statusCode == 401 ? "bad_device" : "server_error";
  }

  Serial.printf("Attendance API response: %s\n", response.c_str());
  if (response.indexOf("\"result\":\"time_out\"") >= 0 ||
      response.indexOf("\"result\": \"time_out\"") >= 0)
  {
    Serial.println("Attendance API result parsed as time_out; reflash this firmware if this line does not appear.");
    return "time_out";
  }
  if (response.indexOf("\"result\":\"accepted\"") >= 0)
    return "accepted";
  if (response.indexOf("\"result\":\"duplicate\"") >= 0)
    return "duplicate";
  if (response.indexOf("\"result\":\"no_event\"") >= 0)
  {
    if (response.indexOf("\"reason\":\"event_not_ongoing\"") >= 0)
      return "event_not_ongoing";
    if (response.indexOf("\"reason\":\"time_in_window_not_open\"") >= 0)
      return "time_in_window_not_open";
    if (response.indexOf("\"reason\":\"event_time_window_closed\"") >= 0)
      return "event_time_window_closed";
    return "no_event";
  }
  if (response.indexOf("\"result\":\"unknown_card\"") >= 0)
    return "unknown_card";
  if (response.indexOf("\"result\":\"inactive_card\"") >= 0)
    return "inactive_card";
  return "server_error";
}

void sendHeartbeat()
{
  if (WiFi.status() != WL_CONNECTED ||
      (heartbeatSent && millis() - lastHeartbeatTime < HEARTBEAT_INTERVAL_MS))
    return;
  lastHeartbeatTime = millis();
  heartbeatSent = true;

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(3000);
  if (!http.begin(client, HEARTBEAT_URL))
  {
    Serial.println("Reader heartbeat connection failed");
    return;
  }
  http.addHeader("x-device-key", DEVICE_KEY);
  const int statusCode = http.POST("");
  const String response = statusCode > 0 ? http.getString() : "";
  http.end();
  if (statusCode >= 200 && statusCode < 300)
    Serial.println("Reader heartbeat: online");
  else
    Serial.printf("Reader heartbeat failed: HTTP %d %s\n", statusCode, response.c_str());
}

void setup()
{
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- RFID Time In System ---");

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  showLCD("Starting...", "");

  connectWiFi();

  nfc.begin();
  nfc.reset();

  uint8_t product[2] = {0}, firmware[2] = {0};
  nfc.readEEprom(PRODUCT_VERSION, product, sizeof(product));
  nfc.readEEprom(FIRMWARE_VERSION, firmware, sizeof(firmware));
  Serial.printf("Product version:  %d.%d\n", product[1], product[0]);
  Serial.printf("Firmware version: %d.%d\n", firmware[1], firmware[0]);

  nfc.setupRF();
  showLCD("RFID Time In", "Tap your card");
  beep(BEEP_READY_MS);
}

void loop()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    WiFi.reconnect();
  }
  sendHeartbeat();

  nfc.reset();
  nfc.setupRF();

  uint8_t uid[10];
  uint8_t len = nfc.readCardSerial(uid);

  if (len > 0)
  {
    String uidStr = "";
    for (int i = 0; i < len; i++)
    {
      if (uid[i] < 0x10)
        uidStr += "0";
      uidStr += String(uid[i], HEX);
    }
    uidStr.toUpperCase();

    // Ignore the same card while it is still held on the reader
    if (uidStr == lastUid && millis() - lastLogTime < 5000)
    {
      delay(200);
      return;
    }

    char timeBuf[16] = "--:--:--";
    char dateBuf[20] = "No date";
    struct tm t;
    if (getLocalTime(&t, 500))
    {
      strftime(timeBuf, sizeof(timeBuf), "%I:%M:%S %p", &t);
      strftime(dateBuf, sizeof(dateBuf), "%a %d %b %Y", &t);
    }

    const String result = scanCard(uidStr);
    Serial.printf("UID: %s | Result: %s | %s | %s\n",
                  uidStr.c_str(), result.c_str(), dateBuf, timeBuf);

    if (result == "accepted" || result == "duplicate")
      beepKnown();
    else if (result == "time_out")
      beepKnown();
    else
      beepUnknown();

    if (result == "accepted")
      showLCD("Attendance saved", String(timeBuf));
    else if (result == "duplicate")
      showLCD("Already recorded", String(timeBuf));
    else if (result == "time_out")
      showLCD("Time out saved", String(timeBuf));
    else if (result == "no_event")
      showLCD("No event assigned", "See administrator");
    else if (result == "event_not_ongoing")
      showLCD("Event not active", "See administrator");
    else if (result == "time_in_window_not_open")
      showLCD("Event not started", "Come back later");
    else if (result == "event_time_window_closed")
      showLCD("Event has ended", "See administrator");
    else if (result == "unknown_card")
      showLCD("Unknown card", uidStr);
    else if (result == "inactive_card")
      showLCD("Card inactive", "See administrator");
    else if (result == "reader_paused")
      showLCD("Time-in paused", "See administrator");
    else if (result == "offline")
      showLCD("WiFi offline", "Scan not sent");
    else
      showLCD("API error", result);

    delay(2500);
    lastUid = uidStr;
    lastLogTime = millis();
    showLCD("RFID Time In", "Tap your card");
  }
  else
  {
    delay(200);
  }
}