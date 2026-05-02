# Re-export R8/ProGuard rules to consumers (the main app) so libbox classes
# stay intact even when minify is on in the host APK/AAB.
-keep class io.nekohasekai.libbox.** { *; }
-keep interface io.nekohasekai.libbox.** { *; }
-keep class go.** { *; }
-keep class com.mint.vpn.** { *; }
