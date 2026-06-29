# Keep jSMPP classes
-keep class org.jsmpp.** { *; }
-dontwarn org.jsmpp.**

# Keep SLF4J
-keep class org.slf4j.** { *; }
-dontwarn org.slf4j.**

# Keep the Gateway service
-keep class com.net2app.smsgw.SmppService { *; }
-keep class com.net2app.smsgw.SmppSessionManager { *; }
