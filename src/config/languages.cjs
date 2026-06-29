// =====================================================================
// Voice OTP language presets. 44 languages covering the major markets.
// Each row carries:
//  - code: BCP-47 locale (used by Asterisk / TTS hints, also TTS can use language)
//  - tts_code: code used by Asterisk's Say application to pick voice
//  - country_code: ISO country dialing prefix (digit prefix, e.g. "1" for US/CA)
//  - display: human label used in GUI
//  - default_greeting: native-language default opening line
//  - default_retry: native-language re-prompt line
// Used by:
//  - frontend src/pages/Suppliers/VoiceOTP.tsx language dropdown
//  - backend /api/voice-otp/languages response
//  - backend asterisk-bridge.cjs for SIP headers + Say()
//
// Note: BCP-47 codes prefixed with "ar-" (and similar non-ASCII scripts)
// are returned unchanged by Node JSON. The /api responses gate the
// load() with status 200 so res.send() encodes the strings verbatim.
// =====================================================================
module.exports = [
  { code:'en-US', tts_code:'en', country_code:'1',   display:'English (US)',         default_greeting:'Hello, your verification code is',            default_retry:'I repeat, your code is' },
  { code:'en-GB', tts_code:'en', country_code:'44',  display:'English (UK)',         default_greeting:'Hello, your verification code is',            default_retry:'I repeat, your code is' },
  { code:'es-ES', tts_code:'es', country_code:'34',  display:'Spanish (Spain)',      default_greeting:'Hola. Su código de verificación es',          default_retry:'Repito, su código es' },
  { code:'es-MX', tts_code:'es', country_code:'52',  display:'Spanish (Mexico)',     default_greeting:'Hola. Su código de verificación es',          default_retry:'Repito, su código es' },
  { code:'fr-FR', tts_code:'fr', country_code:'33',  display:'French (France)',      default_greeting:'Bonjour. Votre code de vérification est',   default_retry:'Je répète, votre code est' },
  { code:'de-DE', tts_code:'de', country_code:'49',  display:'German',               default_greeting:'Hallo. Ihr Bestätigungscode lautet',          default_retry:'Ich wiederhole, Ihr Code lautet' },
  { code:'it-IT', tts_code:'it', country_code:'39',  display:'Italian',              default_greeting:'Salve. Il suo codice di verifica è',          default_retry:'Ripeto, il suo codice è' },
  { code:'pt-BR', tts_code:'pt', country_code:'55',  display:'Portuguese (Brazil)',  default_greeting:'Olá. Seu código de verificação é',          default_retry:'Repito, seu código é' },
  { code:'pt-PT', tts_code:'pt', country_code:'351', display:'Portuguese (PT)',      default_greeting:'Olá. O seu código de verificação é',        default_retry:'Repito, o seu código é' },
  { code:'ru-RU', tts_code:'ru', country_code:'7',   display:'Russian',              default_greeting:'Здравствуйте. Ваш код подтверждения:',       default_retry:'Повторяю, ваш код:' },
  { code:'zh-CN', tts_code:'zh', country_code:'86',  display:'Chinese (Mandarin)',   default_greeting:'您好，您的验证码是',                         default_retry:'重复一遍，您的验证码是' },
  { code:'zh-TW', tts_code:'zh', country_code:'886', display:'Chinese (Traditional)',default_greeting:'您好，您的驗證碼是',                         default_retry:'重複一遍，您的驗證碼是' },
  { code:'ja-JP', tts_code:'ja', country_code:'81',  display:'Japanese',             default_greeting:'こんにちは。確認コードは',                   default_retry:'繰り返し、確認コードは' },
  { code:'ko-KR', tts_code:'ko', country_code:'82',  display:'Korean',               default_greeting:'안녕하세요. 인증 번호는',                     default_retry:'다시 말씀드리면, 인증 번호는' },
  { code:'ar-SA', tts_code:'ar', country_code:'966', display:'Arabic',               default_greeting:'مرحبا. رمز التحقق الخاص بك هو',              default_retry:'أكرر، رمزك هو' },
  { code:'ar-AE', tts_code:'ar', country_code:'971', display:'Arabic (UAE)',         default_greeting:'مرحبا. رمز التحقق الخاص بك هو',              default_retry:'أكرر، رمزك هو' },
  { code:'hi-IN', tts_code:'hi', country_code:'91',  display:'Hindi',                default_greeting:'नमस्ते। आपका सत्यापन कोड है',                default_retry:'दोहराता हूँ, आपका कोड है' },
  { code:'bn-IN', tts_code:'bn', country_code:'91',  display:'Bengali',              default_greeting:'নমস্কার। আপনার যাচাইকরণ কোড হল',            default_retry:'আবার বলছি, আপনার কোড হল' },
  { code:'ur-PK', tts_code:'ur', country_code:'92',  display:'Urdu',                 default_greeting:'ہیلو۔ آپ کا تصدیقی کوڈ ہے',                default_retry:'دہراتا ہوں، آپ کا کوڈ ہے' },
  { code:'fa-IR', tts_code:'fa', country_code:'98',  display:'Persian (Farsi)',      default_greeting:'سلام. کد تأیید شما',                       default_retry:'تکرار می‌کنم، کد شما' },
  { code:'tr-TR', tts_code:'tr', country_code:'90',  display:'Turkish',              default_greeting:'Merhaba. Doğrulama kodunuz',                  default_retry:'Tekrar ediyorum, kodunuz' },
  { code:'nl-NL', tts_code:'nl', country_code:'31',  display:'Dutch',                default_greeting:'Hallo. Uw verificatiecode is',               default_retry:'Ik herhaal, uw code is' },
  { code:'pl-PL', tts_code:'pl', country_code:'48',  display:'Polish',               default_greeting:'Dzień dobry. Twój kod weryfikacyjny to',      default_retry:'Powtarzam, twój kod to' },
  { code:'sv-SE', tts_code:'sv', country_code:'46',  display:'Swedish',              default_greeting:'Hej. Din verifieringskod är',                default_retry:'Jag upprepar, din kod är' },
  { code:'da-DK', tts_code:'da', country_code:'45',  display:'Danish',               default_greeting:'Hej. Din bekræftelseskode er',               default_retry:'Jeg gentager, din kode er' },
  { code:'fi-FI', tts_code:'fi', country_code:'358', display:'Finnish',              default_greeting:'Hei. Vahvistuskoodisi on',                   default_retry:'Toistan, koodisi on' },
  { code:'nb-NO', tts_code:'no', country_code:'47',  display:'Norwegian',            default_greeting:'Hei. Bekreftelseskoden din er',             default_retry:'Jeg gjentar, koden din er' },
  { code:'cs-CZ', tts_code:'cs', country_code:'420', display:'Czech',                default_greeting:'Dobrý den. Váš ověřovací kód je',             default_retry:'Opakuji, váš kód je' },
  { code:'ro-RO', tts_code:'ro', country_code:'40',  display:'Romanian',             default_greeting:'Bună ziua. Codul dvs. de verificare este',   default_retry:'Repet, codul dvs. este' },
  { code:'hu-HU', tts_code:'hu', country_code:'36',  display:'Hungarian',            default_greeting:'Helló. Az Ön ellenőrző kódja',               default_retry:'Megismétlem, a kódja' },
  { code:'el-GR', tts_code:'el', country_code:'30',  display:'Greek',                default_greeting:'Γεια σας. Ο κωδικός επαλήθευσής σας είναι',  default_retry:'Επαναλαμβάνω, ο κωδικός σας είναι' },
  { code:'th-TH', tts_code:'th', country_code:'66',  display:'Thai',                 default_greeting:'สวัสดี รหัสยืนยันของคุณคือ',                  default_retry:'ขอย้ำอีกครั้ง รหัสของคุณคือ' },
  { code:'vi-VN', tts_code:'vi', country_code:'84',  display:'Vietnamese',           default_greeting:'Xin chào. Mã xác minh của bạn là',           default_retry:'Tôi nhắc lại, mã của bạn là' },
  { code:'id-ID', tts_code:'id', country_code:'62',  display:'Indonesian',           default_greeting:'Halo. Kode verifikasi Anda adalah',          default_retry:'Saya ulangi, kode Anda' },
  { code:'ms-MY', tts_code:'ms', country_code:'60',  display:'Malay',                default_greeting:'Halo. Kod pengesahan anda ialah',           default_retry:'Saya ulang, kod anda' },
  { code:'fil-PH', tts_code:'en', country_code:'63', display:'Filipino',             default_greeting:'Hello. Ang verification code mo ay',         default_retry:'Ulitin ko, ang code mo ay' },
  { code:'uk-UA', tts_code:'uk', country_code:'380', display:'Ukrainian',            default_greeting:'Доброго дня. Ваш код підтвердження:',        default_retry:'Повторюю, ваш код:' },
  { code:'he-IL', tts_code:'he', country_code:'972', display:'Hebrew',               default_greeting:'שלום. קוד האימות שלך הוא',                     default_retry:'אני חוזר, הקוד שלך הוא' },
  { code:'ta-IN', tts_code:'ta', country_code:'91',  display:'Tamil',                default_greeting:'வணக்கம். உங்கள் சரிபார்ப்பு குறியீடு',         default_retry:'மீண்டும் சொல்கிறேன், உங்கள் குறியீடு' },
  { code:'te-IN', tts_code:'te', country_code:'91',  display:'Telugu',               default_greeting:'నమస్తే. మీ ధృవీకరణ కోడ్',                       default_retry:'మళ్ళీ చెబుతాను, మీ కోడ్' },
  { code:'sw-KE', tts_code:'en', country_code:'254', display:'Swahili (Kenya)',      default_greeting:'Habari. Msimbo wako wa uthibitisho ni',      default_retry:'Ninayarudia, msimbo wako ni' },
  { code:'yo-NG', tts_code:'en', country_code:'234', display:'Yoruba',               default_greeting:'Bawo. Koodu ifọwọsi rẹ jẹ',                  default_retry:'Mo tun wi, koodu rẹ jẹ' },
  { code:'zu-ZA', tts_code:'en', country_code:'27',  display:'Zulu',                 default_greeting:'Sawubona. Ikhodi yakho yokuqinisekisa',     default_retry:'Ngiphinde, ikhodi yakho' },
];

module.exports.codes = module.exports.map(function (l) { return l.code; });
