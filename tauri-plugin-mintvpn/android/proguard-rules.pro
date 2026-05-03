# sing-box / libbox keeps everything reachable through reflection from Go's
# gomobile runtime — strip nothing under io.nekohasekai.libbox.
-keep class io.nekohasekai.libbox.** { *; }
-keep interface io.nekohasekai.libbox.** { *; }
-keep class go.** { *; }

# Mint plugin entrypoints used by the Tauri annotation processor + by
# AndroidManifest declaration; R8 must not rename them.
-keep class com.mint.vpn.MintVpnPlugin { *; }
-keep class com.mint.vpn.MintVpnService { *; }
-keep class com.mint.vpn.MintPlatformDefaults { *; }
