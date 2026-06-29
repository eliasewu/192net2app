import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Trash2, Play, Upload, Globe, Phone, RefreshCw,
  Server, Loader, Hash, Activity, Mic,
  Save, Edit, AlertCircle, Wifi, WifiOff, Filter
} from 'lucide-react';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Modal } from '../../components/UI/Modal';
import { Input, Select } from '../../components/UI/Input';
import { api } from '../../services/api';
import { useToast } from '../../components/UI/Toast';

// =====================================================================
// DEDUPLICATED LANGUAGE PRESET (~25 unique languages)
// =====================================================================
const LI_LANGUAGES = [
  { code:'en', tts_code:'en', display:'English',        greeting:'Hello, your verification code is',            retry:'I repeat, your code is' },
  { code:'ar', tts_code:'ar', display:'Arabic',         greeting:'\u0645\u0631\u062d\u0628\u0627. \u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062e\u0627\u0635 \u0628\u0643 \u0647\u0648', retry:'\u0623\u0643\u0631\u0631\u060c \u0631\u0645\u0632\u0643 \u0647\u0648' },
  { code:'es', tts_code:'es', display:'Spanish',        greeting:'Hola. Su c\u00f3digo de verificaci\u00f3n es', retry:'Repito, su c\u00f3digo es' },
  { code:'fr', tts_code:'fr', display:'French',          greeting:'Bonjour. Votre code de v\u00e9rification est', retry:'Je r\u00e9p\u00e8te, votre code est' },
  { code:'de', tts_code:'de', display:'German',          greeting:'Hallo. Ihr Best\u00e4tigungscode lautet',      retry:'Ich wiederhole, Ihr Code lautet' },
  { code:'it', tts_code:'it', display:'Italian',         greeting:'Salve. Il suo codice di verifica \u00e8',      retry:'Ripeto, il suo codice \u00e8' },
  { code:'pt', tts_code:'pt', display:'Portuguese',     greeting:'Ol\u00e1. Seu c\u00f3digo de verifica\u00e7\u00e3o \u00e9', retry:'Repito, seu c\u00f3digo \u00e9' },
  { code:'ru', tts_code:'ru', display:'Russian',         greeting:'\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435. \u0412\u0430\u0448 \u043a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f:', retry:'\u041f\u043e\u0432\u0442\u043e\u0440\u044f\u044e, \u0432\u0430\u0448 \u043a\u043e\u0434:' },
  { code:'zh', tts_code:'zh', display:'Chinese',         greeting:'\u60a8\u597d\uff0c\u60a8\u7684\u9a8c\u8bc1\u7801\u662f',           retry:'\u91cd\u590d\u4e00\u904d\uff0c\u60a8\u7684\u9a8c\u8bc1\u7801\u662f' },
  { code:'ja', tts_code:'ja', display:'Japanese',        greeting:'\u3053\u3093\u306b\u3061\u306f\u3002\u78ba\u8a8d\u30b3\u30fc\u30c9\u306f', retry:'\u7e70\u308a\u8fd4\u3057\u3001\u78ba\u8a8d\u30b3\u30fc\u30c9\u306f' },
  { code:'ko', tts_code:'ko', display:'Korean',          greeting:'\uc548\ub155\ud558\uc138\uc694. \uc778\uc99d \ubc88\ud638\ub294',        retry:'\ub2e4\uc2dc \ub9d0\uc500\ub4dc\ub9ac\uba74, \uc778\uc99d \ubc88\ud638\ub294' },
  { code:'hi', tts_code:'hi', display:'Hindi',           greeting:'\u0928\u092e\u0938\u094d\u0924\u0947\u0964 \u0906\u092a\u0915\u093e \u0938\u0924\u094d\u092f\u093e\u092a\u0928 \u0915\u094b\u0921 \u0939\u0948', retry:'\u0926\u094b\u0939\u0930\u093e\u0924\u093e \u0939\u0942\u0901, \u0906\u092a\u0915\u093e \u0915\u094b\u0921 \u0939\u0948' },
  { code:'bn', tts_code:'bn', display:'Bengali',         greeting:'\u09a8\u09ae\u09b8\u09cd\u0995\u09be\u09b0\u0964 \u0986\u09aa\u09a8\u09be\u09b0 \u09af\u09be\u099a\u09be\u0987\u0995\u09b0\u09a3 \u0995\u09cb\u09a1 \u09b9\u09b2', retry:'\u0986\u09ac\u09be\u09b0 \u09ac\u09b2\u099b\u09bf, \u0986\u09aa\u09a8\u09be\u09b0 \u0995\u09cb\u09a1 \u09b9\u09b2' },
  { code:'ur', tts_code:'ur', display:'Urdu',            greeting:'\u06c1\u06cc\u0644\u0648\u06d4 \u0622\u067e \u06a9\u0627 \u062a\u0635\u062f\u06cc\u0642\u06cc \u06a9\u0648\u0688 \u06c1\u06d2', retry:'\u062f\u06c1\u0631\u0627\u062a\u0627 \u06c1\u0648\u06ba\u060c \u0622\u067e \u06a9\u0627 \u06a9\u0648\u0688 \u06c1\u06d2' },
  { code:'fa', tts_code:'fa', display:'Persian',         greeting:'\u0633\u0644\u0627\u0645. \u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0634\u0645\u0627', retry:'\u062a\u06a9\u0631\u0627\u0631 \u0645\u06cc\u200c\u06a9\u0646\u0645\u060c \u06a9\u062f \u0634\u0645\u0627' },
  { code:'tr', tts_code:'tr', display:'Turkish',         greeting:'Merhaba. Do\u011frulama kodunuz',              retry:'Tekrar ediyorum, kodunuz' },
  { code:'nl', tts_code:'nl', display:'Dutch',           greeting:'Hallo. Uw verificatiecode is',               retry:'Ik herhaal, uw code is' },
  { code:'pl', tts_code:'pl', display:'Polish',          greeting:'Dzie\u0144 dobry. Tw\u00f3j kod weryfikacyjny to', retry:'Powtarzam, tw\u00f3j kod to' },
  { code:'sv', tts_code:'sv', display:'Swedish',         greeting:'Hej. Din verifieringskod \u00e4r',            retry:'Jag upprepar, din kod \u00e4r' },
  { code:'th', tts_code:'th', display:'Thai',            greeting:'\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35 \u0e23\u0e2b\u0e31\u0e2a\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d', retry:'\u0e02\u0e2d\u0e22\u0e49\u0e33\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07 \u0e23\u0e2b\u0e31\u0e2a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d' },
  { code:'vi', tts_code:'vi', display:'Vietnamese',      greeting:'Xin ch\u00e0o. M\u00e3 x\u00e1c minh c\u1ee7a b\u1ea1n l\u00e0', retry:'T\u00f4i nh\u1eafc l\u1ea1i, m\u00e3 c\u1ee7a b\u1ea1n l\u00e0' },
  { code:'id', tts_code:'id', display:'Indonesian',      greeting:'Halo. Kode verifikasi Anda adalah',          retry:'Saya ulangi, kode Anda' },
  { code:'ms', tts_code:'ms', display:'Malay',           greeting:'Halo. Kod pengesahan anda ialah',           retry:'Saya ulang, kod anda' },
  { code:'fil',tts_code:'en', display:'Filipino',        greeting:'Hello. Ang verification code mo ay',        retry:'Ulitin ko, ang code mo ay' },
  { code:'uk', tts_code:'uk', display:'Ukrainian',       greeting:'\u0414\u043e\u0431\u0440\u043e\u0433\u043e \u0434\u043d\u044f. \u0412\u0430\u0448 \u043a\u043e\u0434 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f:', retry:'\u041f\u043e\u0432\u0442\u043e\u0440\u044e\u044e, \u0432\u0430\u0448 \u043a\u043e\u0434:' },
  { code:'he', tts_code:'he', display:'Hebrew',          greeting:'\u05e9\u05dc\u05d5\u05dd. \u05e7\u05d5\u05d3 \u05d4\u05d0\u05d9\u05de\u05d5\u05ea \u05e9\u05dc\u05da \u05d4\u05d5\u05d0', retry:'\u05d0\u05e0\u05d9 \u05d7\u05d5\u05d6\u05e8, \u05d4\u05e7\u05d5\u05d3 \u05e9\u05dc\u05da \u05d4\u05d5\u05d0' },
  { code:'km', tts_code:'km', display:'Khmer (Cambodia)',greeting:'\u1787\u1798\u17d2\u179a\u17b6\u1794\u17cb\u179f\u17bd\u179a\u17d2\u1799\u202b\u17d4 \u179b\u17c1\u1781\u1794\u1789\u17d2\u1787\u17b6\u1780\u1780\u17b6\u179a\u1795\u17d2\u1791\u17b6\u1780\u17cb\u1794\u1789\u17d2\u1787\u17b6\u1780\u179a\u17c1\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780\u1782\u17ba', retry:'\u1781\u17d2\u1789\u17bb\u17c6\u1793\u17b7\u1799\u17b6\u1799\u1798\u17d2\u1789\u17c1\u1784\u179c\u17b7\u1789, \u179b\u17c1\u1781\u1794\u1789\u17d2\u1787\u17b6\u1780\u179a\u17c1\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780\u1782\u17ba' },
  { code:'my', tts_code:'my', display:'Burmese (Myanmar)',greeting:'\u1019\u1004\u1039\u1002\u101c\u102c\u1015\u102b\u104b \u101e\u1004\u1037\u1039\u101b\u1032\u1037 \u1021\u1010\u100a\u103a\u1000\u102f\u1014\u103a\u1014\u1019\u1039\u1015\u1010\u103a\u1000\u102f\u1014\u103a\u1019\u103e\u102c', retry:'\u1011\u1015\u1039\u1019\u1036\u101c\u103e\u1000\u1039\u1015\u102b\u1010\u101a\u1039\u104a \u101e\u1004\u1037\u1039\u101b\u1032\u1037 \u1014\u1019\u1039\u1015\u1010\u103a\u1000\u102f\u1014\u103a\u1019\u103e\u102c' },
  { code:'uz', tts_code:'uz', display:'Uzbek',           greeting:'Salom. Tasdiqlash kodingiz',               retry:'Takrorlayman, kodingiz' },
];

// =====================================================================
// DEFAULT COUNTRY GROUPS (seeded when empty)
// =====================================================================
const DEFAULT_GROUPS = [
  { name:'English (Default)',  country_prefix:'+1,+44,+61,+64,+353,+27,+234,+254,+63', primary_language_code:'en', secondary_language_code:'en', primary_greeting_text:'Hello, your verification code is', primary_retry_text:'I repeat, your code is', is_active:true },
  { name:'Arabic Countries',   country_prefix:'+971,+966,+968,+974,+973,+965,+962,+967,+963,+961,+20,+218,+216,+213,+212,+249,+973', primary_language_code:'ar', secondary_language_code:'en', primary_greeting_text:'\u0645\u0631\u062d\u0628\u0627. \u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062e\u0627\u0635 \u0628\u0643 \u0647\u0648', primary_retry_text:'\u0623\u0643\u0631\u0631\u060c \u0631\u0645\u0632\u0643 \u0647\u0648', is_active:true },
  { name:'Spain & Latin America', country_prefix:'+34,+52,+54,+57,+56,+51,+58,+593,+591,+595,+598,+502,+503,+504,+505,+506,+507', primary_language_code:'es', secondary_language_code:'en', primary_greeting_text:'Hola. Su c\u00f3digo de verificaci\u00f3n es', primary_retry_text:'Repito, su c\u00f3digo es', is_active:true },
  { name:'Bangladesh',         country_prefix:'+880', primary_language_code:'bn', secondary_language_code:'en', primary_greeting_text:'\u09a8\u09ae\u09b8\u09cd\u0995\u09be\u09b0\u0964 \u0986\u09aa\u09a8\u09be\u09b0 \u09af\u09be\u099a\u09be\u0987\u0995\u09b0\u09a3 \u0995\u09cb\u09a1 \u09b9\u09b2', primary_retry_text:'\u0986\u09ac\u09be\u09b0 \u09ac\u09b2\u099b\u09bf, \u0986\u09aa\u09a8\u09be\u09b0 \u0995\u09cb\u09a1 \u09b9\u09b2', is_active:true },
  { name:'India',              country_prefix:'+91', primary_language_code:'hi', secondary_language_code:'en', primary_greeting_text:'\u0928\u092e\u0938\u094d\u0924\u0947\u0964 \u0906\u092a\u0915\u093e \u0938\u0924\u094d\u092f\u093e\u092a\u0928 \u0915\u094b\u0921 \u0939\u0948', primary_retry_text:'\u0926\u094b\u0939\u0930\u093e\u0924\u093e \u0939\u0942\u0901, \u0906\u092a\u0915\u093e \u0915\u094b\u0921 \u0939\u0948', is_active:true },
  { name:'Russia',             country_prefix:'+7', primary_language_code:'ru', secondary_language_code:'en', primary_greeting_text:'\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435. \u0412\u0430\u0448 \u043a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f:', primary_retry_text:'\u041f\u043e\u0432\u0442\u043e\u0440\u044f\u044e, \u0432\u0430\u0448 \u043a\u043e\u0434:', is_active:true },
  { name:'Germany',            country_prefix:'+49,+43,+41', primary_language_code:'de', secondary_language_code:'en', primary_greeting_text:'Hallo. Ihr Best\u00e4tigungscode lautet', primary_retry_text:'Ich wiederhole, Ihr Code lautet', is_active:true },
  { name:'France',             country_prefix:'+33,+32', primary_language_code:'fr', secondary_language_code:'en', primary_greeting_text:'Bonjour. Votre code de v\u00e9rification est', primary_retry_text:'Je r\u00e9p\u00e8te, votre code est', is_active:true },
  { name:'Japan',              country_prefix:'+81', primary_language_code:'ja', secondary_language_code:'en', primary_greeting_text:'\u3053\u3093\u306b\u3061\u306f\u3002\u78ba\u8a8d\u30b3\u30fc\u30c9\u306f', primary_retry_text:'\u7e70\u308a\u8fd4\u3057\u3001\u78ba\u8a8d\u30b3\u30fc\u30c9\u306f', is_active:true },
  { name:'Korea',              country_prefix:'+82', primary_language_code:'ko', secondary_language_code:'en', primary_greeting_text:'\uc548\ub155\ud558\uc138\uc694. \uc778\uc99d \ubc88\ud638\ub294', primary_retry_text:'\ub2e4\uc2dc \ub9d0\uc500\ub4dc\ub9ac\uba74, \uc778\uc99d \ubc88\ud638\ub294', is_active:true },
  { name:'China',              country_prefix:'+86,+852,+853,+886', primary_language_code:'zh', secondary_language_code:'en', primary_greeting_text:'\u60a8\u597d\uff0c\u60a8\u7684\u9a8c\u8bc1\u7801\u662f', primary_retry_text:'\u91cd\u590d\u4e00\u904d\uff0c\u60a8\u7684\u9a8c\u8bc1\u7801\u662f', is_active:true },
  { name:'Thailand',           country_prefix:'+66', primary_language_code:'th', secondary_language_code:'en', primary_greeting_text:'\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35 \u0e23\u0e2b\u0e31\u0e2a\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d', primary_retry_text:'\u0e02\u0e2d\u0e22\u0e49\u0e33\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07 \u0e23\u0e2b\u0e31\u0e2a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d', is_active:true },
  { name:'Vietnam',            country_prefix:'+84', primary_language_code:'vi', secondary_language_code:'en', primary_greeting_text:'Xin ch\u00e0o. M\u00e3 x\u00e1c minh c\u1ee7a b\u1ea1n l\u00e0', primary_retry_text:'T\u00f4i nh\u1eafc l\u1ea1i, m\u00e3 c\u1ee7a b\u1ea1n l\u00e0', is_active:true },
  { name:'Indonesia',          country_prefix:'+62', primary_language_code:'id', secondary_language_code:'en', primary_greeting_text:'Halo. Kode verifikasi Anda adalah', primary_retry_text:'Saya ulangi, kode Anda', is_active:true },
  { name:'Malaysia',           country_prefix:'+60', primary_language_code:'ms', secondary_language_code:'en', primary_greeting_text:'Halo. Kod pengesahan anda ialah', primary_retry_text:'Saya ulang, kod anda', is_active:true },
  { name:'Philippines',        country_prefix:'+63', primary_language_code:'fil', secondary_language_code:'en', primary_greeting_text:'Hello. Ang verification code mo ay', primary_retry_text:'Ulitin ko, ang code mo ay', is_active:true },
  { name:'Myanmar',            country_prefix:'+95', primary_language_code:'my', secondary_language_code:'en', primary_greeting_text:'\u1019\u1004\u1039\u1002\u101c\u102c\u1015\u102b\u104b \u101e\u1004\u1037\u1039\u101b\u1032\u1037 \u1021\u1010\u100a\u103a\u1000\u102f\u1014\u103a\u1014\u1019\u1039\u1015\u1010\u103a\u1000\u102f\u1014\u103a\u1019\u103e\u102c', primary_retry_text:'\u1011\u1015\u1039\u1019\u1036\u101c\u103e\u1000\u1039\u1015\u102b\u1010\u101a\u1039\u104a \u101e\u1004\u1037\u1039\u101b\u1032\u1037 \u1014\u1019\u1039\u1015\u1010\u103a\u1000\u102f\u1014\u103a\u1019\u103e\u102c', is_active:true },
  { name:'Cambodia',           country_prefix:'+855', primary_language_code:'km', secondary_language_code:'en', primary_greeting_text:'\u1787\u1798\u17d2\u179a\u17b6\u1794\u17cb\u179f\u17bd\u179a\u17d2\u1799\u202b\u17d4 \u179b\u17c1\u1781\u1794\u1789\u17d2\u1787\u17b6\u1780\u1780\u17b6\u179a\u1795\u17d2\u1791\u17b6\u1780\u17cb\u1794\u1789\u17d2\u1787\u17b6\u1780\u179a\u17c1\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780\u1782\u17ba', primary_retry_text:'\u1781\u17d2\u1789\u17bb\u17c6\u1793\u17b7\u1799\u17b6\u1799\u1798\u17d2\u1789\u17c1\u1784\u179c\u17b7\u1789, \u179b\u17c1\u1781\u1794\u1789\u17d2\u1787\u17b6\u1780\u179a\u17c1\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780\u1782\u17ba', is_active:true },
  { name:'Turkey',             country_prefix:'+90', primary_language_code:'tr', secondary_language_code:'en', primary_greeting_text:'Merhaba. Do\u011frulama kodunuz', primary_retry_text:'Tekrar ediyorum, kodunuz', is_active:true },
  { name:'Uzbekistan',         country_prefix:'+998', primary_language_code:'uz', secondary_language_code:'en', primary_greeting_text:'Salom. Tasdiqlash kodingiz', primary_retry_text:'Takrorlayman, kodingiz', is_active:true },
  { name:'Afghanistan',        country_prefix:'+93', primary_language_code:'fa', secondary_language_code:'en', primary_greeting_text:'\u0633\u0644\u0627\u0645. \u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0634\u0645\u0627', primary_retry_text:'\u062a\u06a9\u0631\u0627\u0631 \u0645\u06cc\u200c\u06a9\u0646\u0645\u060c \u06a9\u062f \u0634\u0645\u0627', is_active:true },
  { name:'Pakistan',           country_prefix:'+92', primary_language_code:'ur', secondary_language_code:'en', primary_greeting_text:'\u06c1\u06cc\u0644\u0648\u06d4 \u0622\u067e \u06a9\u0627 \u062a\u0635\u062f\u06cc\u0642\u06cc \u06a9\u0648\u0688 \u06c1\u06d2', primary_retry_text:'\u062f\u06c1\u0631\u0627\u062a\u0627 \u06c1\u0648\u06ba\u060c \u0622\u067e \u06a9\u0627 \u06a9\u0648\u0688 \u06c1\u06d2', is_active:true },
  { name:'Italy',              country_prefix:'+39', primary_language_code:'it', secondary_language_code:'en', primary_greeting_text:'Salve. Il suo codice di verifica \u00e8', primary_retry_text:'Ripeto, il suo codice \u00e8', is_active:true },
  { name:'Portugal & Brazil',  country_prefix:'+351,+55', primary_language_code:'pt', secondary_language_code:'en', primary_greeting_text:'Ol\u00e1. Seu c\u00f3digo de verifica\u00e7\u00e3o \u00e9', primary_retry_text:'Repito, seu c\u00f3digo \u00e9', is_active:true },
  { name:'Netherlands',        country_prefix:'+31', primary_language_code:'nl', secondary_language_code:'en', primary_greeting_text:'Hallo. Uw verificatiecode is', primary_retry_text:'Ik herhaal, uw code is', is_active:true },
  { name:'Poland',             country_prefix:'+48', primary_language_code:'pl', secondary_language_code:'en', primary_greeting_text:'Dzie\u0144 dobry. Tw\u00f3j kod weryfikacyjny to', primary_retry_text:'Powtarzam, tw\u00f3j kod to', is_active:true },
  { name:'Sweden',             country_prefix:'+46', primary_language_code:'sv', secondary_language_code:'en', primary_greeting_text:'Hej. Din verifieringskod \u00e4r', primary_retry_text:'Jag upprepar, din kod \u00e4r', is_active:true },
  { name:'Ukraine',            country_prefix:'+380', primary_language_code:'uk', secondary_language_code:'en', primary_greeting_text:'\u0414\u043e\u0431\u0440\u043e\u0433\u043e \u0434\u043d\u044f. \u0412\u0430\u0448 \u043a\u043e\u0434 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f:', primary_retry_text:'\u041f\u043e\u0432\u0442\u043e\u0440\u044e\u044e, \u0432\u0430\u0448 \u043a\u043e\u0434:', is_active:true },
  { name:'Israel',             country_prefix:'+972', primary_language_code:'he', secondary_language_code:'en', primary_greeting_text:'\u05e9\u05dc\u05d5\u05dd. \u05e7\u05d5\u05d3 \u05d4\u05d0\u05d9\u05de\u05d5\u05ea \u05e9\u05dc\u05da \u05d4\u05d5\u05d0', primary_retry_text:'\u05d0\u05e0\u05d9 \u05d7\u05d5\u05d6\u05e8, \u05d4\u05e7\u05d5\u05d3 \u05e9\u05dc\u05da \u05d4\u05d5\u05d0', is_active:true },
];

// =====================================================================
// TABS
// =====================================================================
const TABS = [
  { key: 'languages', label: 'Languages',        icon: <Globe size={14} /> },
  { key: 'audio',     label: 'Audio',            icon: <Mic size={14} /> },
  { key: 'sip',       label: 'SIP Config',       icon: <Server size={14} /> },
  { key: 'logs',      label: 'Call Logs',        icon: <Phone size={14} /> },
];
type TabKey = 'languages' | 'audio' | 'sip' | 'logs';

// Helper to get language display name from code
function langDisplay(code: string): string {
  const l = LI_LANGUAGES.find(x => x.code === code);
  return l ? l.display : code;
}

// =====================================================================
// VoiceOTP Component
// =====================================================================
export const VoiceOTP: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [tab, setTab] = useState<TabKey>('languages');

  // --- Languages state ---
  const [configs, setConfigs] = useState<any[]>([]);
  const [langSearch, setLangSearch] = useState('');
  const [showLangModal, setShowLangModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [groupForm, setGroupForm] = useState<Record<string, any>>({});
  const [langSaving, setLangSaving] = useState(false);

  // --- Audio state ---
  const [audioGroupId, setAudioGroupId] = useState<number | null>(null);
  const [audioFlavor, setAudioFlavor] = useState<'primary' | 'secondary'>('primary');
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [convertingMsg, setConvertingMsg] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // --- SIP state ---
  const [servers, setServers] = useState<any[]>([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [editingServer, setEditingServer] = useState<any | null>(null);
  const [serverForm, setServerForm] = useState<Record<string, any>>({});
  const [serverSaving, setServerSaving] = useState(false);

  // --- Logs state ---
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilters, setLogFilters] = useState({ status: '', language: '', date_from: '', date_to: '' });
  const [logsLoading, setLogsLoading] = useState(false);

  // ===================== HELPERS =====================
  const getAudioFiles = (cfg: any, flavor: 'primary' | 'secondary') => {
    if (!cfg) return {};
    return flavor === 'primary' ? (cfg.audio_files || {}) : (cfg.secondary_audio_files || {});
  };
  const getGreetingUrl = (cfg: any, flavor: 'primary' | 'secondary') => {
    if (!cfg) return '';
    return flavor === 'primary' ? (cfg.greeting_audio_url || '') : (cfg.secondary_greeting_audio_url || '');
  };
  const getLanguageCode = (cfg: any, flavor: 'primary' | 'secondary') => {
    if (!cfg) return 'en';
    return flavor === 'primary' ? (cfg.primary_language_code || 'en') : (cfg.secondary_language_code || 'en');
  };

  // ===================== LOADERS =====================
  const loadConfigs = useCallback(async () => {
    try {
      const r = await api.get('/voice-otp/configs');
      if (r?.success) setConfigs(r.data || []);
    } catch {}
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const r = await api.get('/asterisk/servers');
      if (r?.success) setServers(r.data || []);
    } catch {}
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const body: any = { limit: 200 };
      if (logFilters.status) body.status = logFilters.status;
      if (logFilters.language) body.language = logFilters.language;
      if (logFilters.date_from) body.date_from = logFilters.date_from;
      if (logFilters.date_to) body.date_to = logFilters.date_to;
      const r = await api.post('/voice-otp/logs', body);
      setLogs(r?.data || []);
    } catch {} finally { setLogsLoading(false); }
  }, [logFilters]);

  useEffect(() => {
    loadConfigs();
    loadServers();
    loadLogs();
  }, []);

  // Seed defaults only once when the table is empty
  useEffect(() => {
    if (configs.length === 0) {
      api.post('/voice-otp/seed-defaults', { groups: DEFAULT_GROUPS }).then(() => loadConfigs()).catch(() => {});
    }
  }, [configs.length]);

  const refreshAll = () => { loadConfigs(); loadServers(); loadLogs(); };

  // ===================== LANGUAGE GROUP CRUD =====================
  const openGroupModal = (group?: any) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.language || '',
        country_prefix: group.country_prefix || '',
        primary_language_code: group.primary_language_code || 'en',
        secondary_language_code: group.secondary_language_code || 'en',
        primary_greeting_text: group.primary_greeting_text || group.greeting_text || '',
        primary_retry_text: group.primary_retry_text || group.retry_text || '',
        secondary_greeting_text: group.secondary_greeting_text || '',
        secondary_retry_text: group.secondary_retry_text || '',
        is_active: group.is_active !== false,
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: '', country_prefix: '',
        primary_language_code: 'en', secondary_language_code: 'en',
        primary_greeting_text: '', primary_retry_text: '',
        secondary_greeting_text: '', secondary_retry_text: '',
        is_active: true,
      });
    }
    setShowLangModal(true);
  };

  const saveGroup = async () => {
    setLangSaving(true);
    try {
      const body: any = {
        language: groupForm.name,
        country_prefix: groupForm.country_prefix,
        primary_language_code: groupForm.primary_language_code,
        secondary_language_code: groupForm.secondary_language_code,
        primary_greeting_text: groupForm.primary_greeting_text,
        primary_retry_text: groupForm.primary_retry_text,
        secondary_greeting_text: groupForm.secondary_greeting_text,
        secondary_retry_text: groupForm.secondary_retry_text,
        is_active: groupForm.is_active,
        language_code: groupForm.primary_language_code, // backward compat
        greeting_text: groupForm.primary_greeting_text,
        retry_text: groupForm.primary_retry_text,
      };
      if (editingGroup) {
        await api.put('/voice-otp/configs/' + editingGroup.id, body);
      } else {
        await api.post('/voice-otp/configs', body);
      }
      setShowLangModal(false);
      await loadConfigs();
    } catch (e: any) {
      addToast('error', 'Failed to save: ' + (e?.message || ''));
    } finally { setLangSaving(false); }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm('Delete this country group? This cannot be undone.')) return;
    try {
      await api.delete('/voice-otp/configs/' + id);
      await loadConfigs();
      addToast('success', 'Country group deleted');
    } catch (e: any) { addToast('error', 'Failed to delete: ' + (e?.message || '')); }
  };

  const toggleActive = async (cfg: any) => {
    try {
      await api.put('/voice-otp/configs/' + cfg.id, { is_active: !cfg.is_active });
      await loadConfigs();
    } catch {}
  };

  // ===================== AUDIO UPLOAD =====================
  const selectedGroup = configs.find((c: any) => c.id === audioGroupId);

  const handleAudioUpload = async (digit: string, file: File) => {
    if (!file || !selectedGroup) return;
    if (!/^[0-9]$/.test(digit) && digit !== 'greeting') { addToast('error', 'digit must be 0-9'); return; }
    const key = audioFlavor + '-' + digit;
    setUploadBusy(key);
    const isMp3 = file.name.toLowerCase().endsWith('.mp3');
    if (isMp3) setConvertingMsg(key);
    try {
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('language_code', selectedGroup.language_code || getLanguageCode(selectedGroup, audioFlavor));
      fd.append('digit', digit);
      fd.append('group_id', String(selectedGroup.id));
      fd.append('flavor', audioFlavor);
      const token = api.getToken();
      const resp = await fetch('/api/voice-otp/audio-upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await resp.json();
      if (data?.success) {
        await loadConfigs();
        addToast('success', 'Audio uploaded');
      } else {
        addToast('error', 'Audio upload failed: ' + (data?.error || 'unknown'));
      }
    } catch (e: any) {
      addToast('error', 'Audio upload failed: ' + e.message);
    } finally {
      setUploadBusy(null);
      setConvertingMsg(null);
    }
  };

  // ===================== SIP SERVER CRUD =====================
  const openServerForm = (server?: any) => {
    if (server) {
      setEditingServer(server);
      setServerForm({ ...server });
    } else {
      setEditingServer(null);
      setServerForm({
        name: '', ami_host: '', sip_host: '', ami_port: 5038, sip_port: 5060,
        ami_username: 'net2app', ami_secret: 'net2app_secret', transport: 'udp',
        dialplan_context: 'net2app-otp', priority: 10, is_active: true,
      });
    }
    setShowServerModal(true);
  };

  const saveServer = async () => {
    setServerSaving(true);
    try {
      if (editingServer) {
        await api.put('/asterisk/servers/' + editingServer.id, serverForm);
      } else {
        await api.post('/asterisk/servers', serverForm);
      }
      setShowServerModal(false);
      await loadServers();
    } catch (e: any) { addToast('error', 'Failed to save server: ' + (e?.message || '')); }
    finally { setServerSaving(false); }
  };

  const deleteServer = async (id: number) => {
    if (!confirm('Archive this SIP server?')) return;
    try { await api.delete('/asterisk/servers/' + id); await loadServers(); addToast('success', 'Server archived'); } catch {}
  };

  const testServer = async (id: number) => {
    try {
      const r = await api.post('/asterisk/servers/' + id + '/test', {});
      if (r?.data?.ok) addToast('success', 'Server reachable ✓');
      else addToast('error', 'Server unreachable: ' + (r?.data?.error || 'unknown'));
    } catch { addToast('error', 'Health check failed'); }
  };

  // ===================== STATS =====================
  const activeGroups = configs.filter((c: any) => c.is_active !== false).length;
  const groupsWithPrimaryAudio = configs.filter((c: any) => Object.keys(c.audio_files || {}).length >= 10).length;
  const serversUp = servers.filter((s: any) => s.last_health_status === 'ok').length;
  const callSuccessRate = logs.length
    ? ((logs.filter((l: any) => l.dial_status === 'CONNECTED' || l.status === 'completed').length / logs.length) * 100).toFixed(1)
    : '0.0';

  // Filtered configs for search
  const filteredConfigs = configs.filter((c: any) =>
    (c.language + ' ' + (c.country_prefix || '')).toLowerCase().includes(langSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Voice OTP</h1>
          <p className="text-gray-500 mt-1">{configs.length} country groups &bull; Asterisk SIP &bull; Call delivery logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refreshAll}>Refresh</Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-xl p-4">
          <Globe size={20} className="mb-2" /><p className="text-sm opacity-80">Groups</p><p className="text-2xl font-bold">{configs.length}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-xl p-4">
          <Activity size={20} className="mb-2" /><p className="text-sm opacity-80">Active</p><p className="text-2xl font-bold">{activeGroups}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-xl p-4">
          <Upload size={20} className="mb-2" /><p className="text-sm opacity-80">10-digit audio</p><p className="text-2xl font-bold">{groupsWithPrimaryAudio}/{configs.length}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-xl p-4">
          <Server size={20} className="mb-2" /><p className="text-sm opacity-80">SIP servers up</p><p className="text-2xl font-bold">{serversUp}/{servers.length || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-700 to-gray-800 text-white rounded-xl p-4">
          <Phone size={20} className="mb-2" /><p className="text-sm opacity-80">Connect rate</p><p className="text-2xl font-bold">{callSuccessRate}%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as TabKey)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ===================== TAB 1: LANGUAGES (Country Groups) ===================== */}
      {tab === 'languages' && (
        <Card title={`Country Groups (${configs.length})`}
          subtitle="Each group maps country prefixes to 1st (primary) and 2nd (retry) languages. English is the default fallback for all."
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Search..."
                  value={langSearch} onChange={(e) => setLangSearch(e.target.value)} />
              </div>
              <Button icon={<Plus size={16} />} onClick={() => openGroupModal()}>Add Group</Button>
            </div>
          }
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-900">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Country Group</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Prefixes</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">1st Language</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">2nd Language</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">1st Audio</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">2nd Audio</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">Active</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredConfigs.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Globe size={32} className="mx-auto mb-2 opacity-30" />
                    <p>{configs.length === 0 ? 'No country groups yet' : 'No matching groups'}</p>
                    {configs.length === 0 && <Button className="mt-3" icon={<Plus size={14} />} onClick={() => openGroupModal()}>Add First Group</Button>}
                  </td></tr>
                ) : (
                  filteredConfigs.map((cfg: any) => {
                    const priCode = cfg.primary_language_code || 'en';
                    const secCode = cfg.secondary_language_code || 'en';
                    const priAudioCount = Object.keys(cfg.audio_files || {}).length;
                    const secAudioCount = Object.keys(cfg.secondary_audio_files || {}).length;
                    return (
                      <tr key={cfg.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{cfg.language || 'Unnamed'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600 max-w-[200px] truncate" title={cfg.country_prefix}>{cfg.country_prefix || '-'}</td>
                        <td className="px-4 py-2.5 text-center"><Badge variant="info">{langDisplay(priCode)}</Badge></td>
                        <td className="px-4 py-2.5 text-center"><Badge variant={secCode === priCode ? 'default' : 'warning'}>{langDisplay(secCode)}</Badge></td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={priAudioCount >= 10 ? 'success' : priAudioCount > 0 ? 'warning' : 'danger'}>{priAudioCount}/10</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={secAudioCount >= 10 ? 'success' : secAudioCount > 0 ? 'warning' : 'default'}>{secAudioCount}/10</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => toggleActive(cfg)}
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              cfg.is_active !== false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                            {cfg.is_active !== false ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex justify-center gap-1">
                            <Button size="sm" variant="secondary" onClick={() => openGroupModal(cfg)} icon={<Edit size={12} />}>Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => deleteGroup(cfg.id)} icon={<Trash2 size={12} />} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Language Group Add/Edit Modal */}
      <Modal isOpen={showLangModal} onClose={() => setShowLangModal(false)}
        title={editingGroup ? 'Edit Country Group' : 'Add Country Group'} size="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowLangModal(false)}>Cancel</Button>
            <Button onClick={saveGroup} loading={langSaving} icon={<Save size={14} />}>
              {editingGroup ? 'Update' : 'Create'}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <Input label="Group Name *" value={groupForm.name || ''}
            onChange={(e) => setGroupForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="e.g. Arabic Countries" />
          <Input label="Country Prefixes (comma-separated) *" value={groupForm.country_prefix || ''}
            onChange={(e) => setGroupForm((p: any) => ({ ...p, country_prefix: e.target.value }))} placeholder="+971,+966,+968,+974" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="1st Language (Primary)" value={groupForm.primary_language_code || 'en'}
              onChange={(e) => setGroupForm((p: any) => ({ ...p, primary_language_code: e.target.value }))}
              options={LI_LANGUAGES.map((l) => ({ value: l.code, label: l.display }))} />
            <Select label="2nd Language (Retry)" value={groupForm.secondary_language_code || 'en'}
              onChange={(e) => setGroupForm((p: any) => ({ ...p, secondary_language_code: e.target.value }))}
              options={LI_LANGUAGES.map((l) => ({ value: l.code, label: l.display }))} />
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">1st Language Texts</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Greeting Text" value={groupForm.primary_greeting_text || ''}
                onChange={(e) => setGroupForm((p: any) => ({ ...p, primary_greeting_text: e.target.value }))} />
              <Input label="Retry Text" value={groupForm.primary_retry_text || ''}
                onChange={(e) => setGroupForm((p: any) => ({ ...p, primary_retry_text: e.target.value }))} />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">2nd Language Texts</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Greeting Text" value={groupForm.secondary_greeting_text || ''}
                onChange={(e) => setGroupForm((p: any) => ({ ...p, secondary_greeting_text: e.target.value }))} />
              <Input label="Retry Text" value={groupForm.secondary_retry_text || ''}
                onChange={(e) => setGroupForm((p: any) => ({ ...p, secondary_retry_text: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={groupForm.is_active !== false}
              onChange={(e) => setGroupForm((p: any) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm">Active</span>
          </label>
        </div>
      </Modal>

      {/* ===================== TAB 2: AUDIO ===================== */}
      {tab === 'audio' && (
        <>
          <Card title="Audio Upload"
            subtitle={selectedGroup
              ? `${selectedGroup.language}: 1st=${langDisplay(getLanguageCode(selectedGroup, 'primary'))}, 2nd=${langDisplay(getLanguageCode(selectedGroup, 'secondary'))}`
              : 'Select a country group to upload audio for its primary and secondary languages.'}
            action={
              <div className="w-64">
                <Select label="" value={audioGroupId ?? ''}
                  onChange={(e) => setAudioGroupId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: '-- Select group --' },
                    ...configs.filter((c: any) => c.is_active !== false).map((c: any) => ({ value: String(c.id), label: c.language || 'Unnamed' })),
                  ]} />
              </div>
            }>
            {!selectedGroup ? (
              <div className="text-center py-8 text-gray-400">
                <Mic size={48} className="mx-auto mb-4 opacity-30" /><p>Select a country group above to start uploading audio</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Flavor toggle */}
                <div className="flex gap-2">
                  <button onClick={() => setAudioFlavor('primary')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      audioFlavor === 'primary' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    1st Language: {langDisplay(getLanguageCode(selectedGroup, 'primary'))}
                  </button>
                  <button onClick={() => setAudioFlavor('secondary')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      audioFlavor === 'secondary' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    2nd Language: {langDisplay(getLanguageCode(selectedGroup, 'secondary'))}
                  </button>
                </div>

                {/* Greeting audio */}
                <div className="border-2 border-dashed border-blue-300 rounded-xl p-4 bg-blue-50">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Mic size={16} className="text-blue-600" /> Greeting Audio
                  </h4>
                  <AudioRow digit="greeting" audioUrl={getGreetingUrl(selectedGroup, audioFlavor)}
                    uploadBusy={uploadBusy} convertingMsg={convertingMsg} audioFlavor={audioFlavor}
                    audioRefs={audioRefs} onUpload={handleAudioUpload} />
                </div>

                {/* Digit grid */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Hash size={16} className="text-purple-600" /> Digit Audio (0-9)
                  </h4>
                  <div className="grid grid-cols-5 gap-3">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                      const digit = String(d);
                      const audioFiles = getAudioFiles(selectedGroup, audioFlavor);
                      const audioUrl = audioFiles[digit];
                      const key = audioFlavor + '-' + digit;
                      const isUploading = uploadBusy === key;
                      return (
                        <div key={d} className={`relative border-2 rounded-xl p-3 flex flex-col items-center gap-2 transition-all hover:shadow-md ${
                          audioUrl ? 'border-green-300 bg-green-50' : 'border-dashed border-gray-300 bg-gray-50'}`}>
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-sm">{d}</div>
                          {audioUrl ? (
                            <>
                              <Badge variant="success">WAV</Badge>
                              <div className="flex gap-1">
                                <button onClick={() => { const a = audioRefs.current[key]; if (a) { a.currentTime = 0; a.play().catch(() => {}); } }}
                                  className="p-1.5 rounded-full bg-green-100 hover:bg-green-200"><Play size={14} className="text-green-600" /></button>
                                <label className="p-1.5 rounded-full bg-blue-100 hover:bg-blue-200 cursor-pointer" title="Replace">
                                  <Upload size={14} className="text-blue-600" />
                                  <input type="file" className="hidden" accept="audio/mpeg,audio/wav,.mp3,.wav"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioUpload(digit, f); }} />
                                </label>
                              </div>
                              <audio ref={(el) => { audioRefs.current[key] = el; }} src={audioUrl} preload="auto" className="hidden" />
                            </>
                          ) : convertingMsg === key ? (
                            <div className="text-center text-xs text-yellow-600 py-1"><Loader size={12} className="animate-spin mx-auto mb-1" />Converting mp3 → wav…</div>
                          ) : (
                            <label className={`flex items-center gap-1 cursor-pointer text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                              isUploading ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}>
                              {isUploading ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                              {isUploading ? 'Uploading…' : 'Upload'}
                              <input type="file" className="hidden" accept="audio/mpeg,audio/wav,.mp3,.wav"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioUpload(digit, f); }} disabled={isUploading} />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">Upload mp3 or wav files — auto-converted to 8kHz mono wav.</p>
                </div>
              </div>
            )}
          </Card>

          {/* Audio status overview */}
          <Card title="Audio Upload Status (all groups)" subtitle="Click a group to jump to audio upload" noPadding>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr className="bg-gray-800 border-b-2 border-gray-900">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Group</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">1st Greeting</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">1st Digits</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">2nd Greeting</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">2nd Digits</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {                  configs.map((cfg: any) => {
                    const priHasGreeting = !!(cfg.greeting_audio_url);
                    const secHasGreeting = !!(cfg.secondary_greeting_audio_url);
                    const priDigits = Object.keys(cfg.audio_files || {}).length;
                    const secDigits = Object.keys(cfg.secondary_audio_files || {}).length;
                    const complete = priHasGreeting && priDigits >= 10 && secDigits >= 10;
                    return (
                      <tr key={cfg.id} onClick={() => { setAudioGroupId(cfg.id); setTab('audio'); }}
                        className="border-b hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium">{cfg.language || 'Unnamed'}</td>
                        <td className="px-4 py-2.5 text-center">{priHasGreeting ? <Badge variant="success">✓</Badge> : <Badge variant="danger">✗</Badge>}</td>
                        <td className="px-4 py-2.5 text-center"><Badge variant={priDigits >= 10 ? 'success' : priDigits > 0 ? 'warning' : 'danger'}>{priDigits}/10</Badge></td>
                        <td className="px-4 py-2.5 text-center">{secHasGreeting ? <Badge variant="success">✓</Badge> : <Badge variant="danger">✗</Badge>}</td>
                        <td className="px-4 py-2.5 text-center"><Badge variant={secDigits >= 10 ? 'success' : secDigits > 0 ? 'warning' : 'default'}>{secDigits}/10</Badge></td>
                        <td className="px-4 py-2.5 text-center"><Badge variant={complete ? 'success' : 'warning'} dot>{complete ? 'Complete' : 'Partial'}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ===================== TAB 3: SIP CONFIG ===================== */}
      {tab === 'sip' && (
        <>
          <Card title="SIP Servers" subtitle={`${servers.length} server(s) configured • ${serversUp} healthy`}
            action={<Button icon={<Plus size={16} />} onClick={() => openServerForm()}>Add Server</Button>}>
            {servers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Server size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No SIP servers configured</p>
                <Button className="mt-4" icon={<Plus size={16} />} onClick={() => openServerForm()}>Add First Server</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((srv: any) => (
                  <div key={srv.id} className={`border rounded-xl p-4 transition-all hover:shadow-sm ${srv.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          srv.last_health_status === 'ok' ? 'bg-green-100' : srv.last_health_status === 'down' ? 'bg-red-100' : 'bg-gray-100'}`}>
                          {srv.last_health_status === 'ok' ? <Wifi size={18} className="text-green-600" /> :
                           srv.last_health_status === 'down' ? <WifiOff size={18} className="text-red-600" /> :
                           <AlertCircle size={18} className="text-gray-400" />}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-800">{srv.name}</h4>
                          <p className="text-xs text-gray-500 font-mono">AMI: {srv.ami_host}:{srv.ami_port} • SIP: {srv.sip_host}:{srv.sip_port}</p>
                        </div>
                        <Badge variant={srv.is_active ? 'success' : 'danger'} dot>{srv.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => testServer(srv.id)} icon={<Activity size={12} />}>Test</Button>
                        <Button variant="secondary" size="sm" onClick={() => openServerForm(srv)} icon={<Edit size={12} />}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => deleteServer(srv.id)} icon={<Trash2 size={12} />}>Archive</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Quick Actions"><div className="flex gap-3 flex-wrap">
            <Button variant="secondary" onClick={() => navigate('/system/asterisk-destinations')}>Destination Routing</Button>
            <Button variant="secondary" onClick={() => navigate('/system/asterisk')}>Asterisk Config</Button>
          </div></Card>
          <Modal isOpen={showServerModal} onClose={() => setShowServerModal(false)}
            title={editingServer ? 'Edit SIP Server' : 'Add SIP Server'} size="lg"
            footer={<div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setShowServerModal(false)}>Cancel</Button><Button onClick={saveServer} loading={serverSaving} icon={<Save size={14} />}>Save</Button></div>}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Input label="Server Name" value={serverForm.name || ''} onChange={(e) => setServerForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
              <Input label="AMI Host" value={serverForm.ami_host || ''} onChange={(e) => setServerForm((p: any) => ({ ...p, ami_host: e.target.value }))} />
              <Input label="AMI Port" type="number" value={serverForm.ami_port ?? 5038} onChange={(e) => setServerForm((p: any) => ({ ...p, ami_port: parseInt(e.target.value) }))} />
              <Input label="SIP Host" value={serverForm.sip_host || ''} onChange={(e) => setServerForm((p: any) => ({ ...p, sip_host: e.target.value }))} />
              <Input label="SIP Port" type="number" value={serverForm.sip_port ?? 5060} onChange={(e) => setServerForm((p: any) => ({ ...p, sip_port: parseInt(e.target.value) }))} />
              <Input label="AMI Username" value={serverForm.ami_username || 'net2app'} onChange={(e) => setServerForm((p: any) => ({ ...p, ami_username: e.target.value }))} />
              <Input label="AMI Secret" type="password" value={serverForm.ami_secret || ''} onChange={(e) => setServerForm((p: any) => ({ ...p, ami_secret: e.target.value }))} />
              <Select label="Transport" value={serverForm.transport || 'udp'} onChange={(e) => setServerForm((p: any) => ({ ...p, transport: e.target.value }))}
                options={[{value:'udp',label:'UDP'},{value:'tcp',label:'TCP'},{value:'tls',label:'TLS'}]} />
              <Input label="Priority" type="number" value={serverForm.priority ?? 10} onChange={(e) => setServerForm((p: any) => ({ ...p, priority: parseInt(e.target.value) }))} />
              <div className="col-span-2"><Input label="Dialplan Context" value={serverForm.dialplan_context || 'net2app-otp'} onChange={(e) => setServerForm((p: any) => ({ ...p, dialplan_context: e.target.value }))} /></div>
            </div>
          </Modal>
        </>
      )}

      {/* ===================== TAB 4: CALL LOGS ===================== */}
      {tab === 'logs' && (
        <>
          <Card title="Call Logs (CDR)" subtitle="Voice OTP delivery history with DLR statuses"
            action={<Button variant="secondary" icon={<RefreshCw size={14} />} onClick={loadLogs} loading={logsLoading}>Refresh</Button>}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Select label="Status" value={logFilters.status} onChange={(e) => setLogFilters((p: any) => ({ ...p, status: e.target.value }))}
                options={[{value:'',label:'All'},{value:'initiated',label:'Initiated'},{value:'completed',label:'Completed'},{value:'failed',label:'Failed'},{value:'retrying',label:'Retrying'}]} />
              <Select label="Language" value={logFilters.language} onChange={(e) => setLogFilters((p: any) => ({ ...p, language: e.target.value }))}
                options={[{value:'',label:'All'},...LI_LANGUAGES.map(l=>({value:l.code,label:l.display}))]} />
              <Input label="Date from" type="date" value={logFilters.date_from} onChange={(e) => setLogFilters((p: any) => ({ ...p, date_from: e.target.value }))} />
              <Input label="Date to" type="date" value={logFilters.date_to} onChange={(e) => setLogFilters((p: any) => ({ ...p, date_to: e.target.value }))} />
            </div>
            <div className="flex gap-2 mb-4">
              <Button variant="secondary" size="sm" icon={<Filter size={12} />} onClick={loadLogs}>Apply</Button>
              <Button variant="secondary" size="sm" onClick={() => { setLogFilters({status:'',language:'',date_from:'',date_to:''}); setTimeout(() => loadLogs(), 50); }}>Clear</Button>
            </div>
          </Card>
          <Card title={`Results (${logs.length})`} noPadding>
            <div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-gray-800 border-b-2 border-gray-900">
              <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Call ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Destination</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Language</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">OTP</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase">DLR</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase">Created</th>
            </tr></thead><tbody>
              {logs.length === 0 ? (<tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400"><Phone size={32} className="mx-auto mb-2 opacity-30" /><p>No call logs found</p></td></tr>) : (
                logs.map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{l.call_id}</td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{l.destination}</td>
                    <td className="px-4 py-3"><Badge variant="info">{l.language || '-'}</Badge></td>
                    <td className="px-4 py-3 text-center font-mono font-bold">{l.otp_code}</td>
                    <td className="px-4 py-3 text-center"><Badge variant={l.status==='completed'?'success':l.status==='failed'?'danger':'warning'} dot>{l.dial_status||l.status||'unknown'}</Badge></td>
                    <td className="px-4 py-3 text-center"><Badge variant={l.dlr_status==='CONNECTED'||l.dlr_status==='DELIVRD'?'success':'default'}>{l.dlr_status||'pending'}</Badge></td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody></table></div>
          </Card>
        </>
      )}
    </div>
  );
};

// =====================================================================
// AudioRow - reusable audio upload row for greeting per flavor
// =====================================================================
const AudioRow: React.FC<{
  digit: string; audioUrl: string; uploadBusy: string | null;
  convertingMsg: string | null; audioFlavor: string;
  audioRefs: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
  onUpload: (digit: string, file: File) => void;
}> = ({ digit, audioUrl, uploadBusy, convertingMsg, audioFlavor, audioRefs, onUpload }) => {
  const key = audioFlavor + '-' + digit;
  if (audioUrl) {
    return (
      <div className="flex items-center gap-4">
        <Badge variant="success">WAV</Badge>
        <button onClick={() => { const a = audioRefs.current[key]; if (a) { a.currentTime = 0; a.play().catch(() => {}); } }}
          className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors"><Play size={16} className="text-blue-600" /></button>
        <audio ref={(el) => { audioRefs.current[key] = el; }} src={audioUrl} preload="auto" className="hidden" />
        <label className="cursor-pointer text-sm text-blue-600 hover:text-blue-800"><Upload size={14} className="inline mr-1" />Replace
          <input type="file" className="hidden" accept="audio/mpeg,audio/wav,.mp3,.wav"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(digit, f); }} />
        </label>
      </div>
    );
  }
  if (convertingMsg === key) {
    return <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm"><Loader size={14} className="animate-spin" />Converting mp3 → wav (8kHz mono)…</div>;
  }
  if (uploadBusy === key) {
    return <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm"><Loader size={14} className="animate-spin" />Uploading…</div>;
  }
  return (
    <label className="flex items-center gap-2 cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
      <Upload size={14} />Upload Greeting (mp3/wav)
      <input type="file" className="hidden" accept="audio/mpeg,audio/wav,.mp3,.wav"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(digit, f); }} />
    </label>
  );
};
