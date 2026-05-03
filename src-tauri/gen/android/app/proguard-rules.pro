# Tauri WRY WebView bridge — keep JS interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.tauri.** { *; }

# Keep Tauri plugin classes
-keep class com.mint.** { *; }

# sing-box / libbox
-keep class io.nekohasekai.libbox.** { *; }
-keep class go.** { *; }

# Keep native method declarations
-keepclasseswithmembernames class * {
    native <methods>;
}
