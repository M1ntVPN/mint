import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 35
    namespace = "com.mint.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.mint.app"
        // Android 8.0 (Oreo, API 26).
        // Tauri's PluginManager constructor does
        //   ObjectMapper.<clinit> -> JacksonAnnotationIntrospector.<clinit>
        // which references java.lang.BootstrapMethodError (added to ART
        // in API 26) via an invokedynamic site that D8 cannot desugar
        // even with isCoreLibraryDesugaringEnabled=true. Anything below
        // API 26 (Android 7.x; e.g. default Nox Player 7) crashes at
        // startup with NoClassDefFoundError. API 26 covers ~96% of all
        // active Android devices and matches sing-box-for-android's
        // 'play' flavor minSdk.
        minSdk = 26
        targetSdk = 35
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        val ksPath = System.getenv("ANDROID_KEYSTORE")
        if (!ksPath.isNullOrEmpty() && file(ksPath).exists()) {
            create("release") {
                storeFile = file(ksPath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            // R8 keeps stripping classes that libbox/Tauri load via reflection
            // even with broad keep rules, which manifests as
            // ClassNotFoundException at startup on some emulators (Nox). Until
            // we have a comprehensive R8 ruleset that survives a real device
            // matrix, ship release builds without minification — the size
            // overhead (~5-10 MB on a 195 MB APK) is acceptable.
            isMinifyEnabled = false
            val releaseSigning = signingConfigs.findByName("release")
            if (releaseSigning != null) {
                signingConfig = releaseSigning
            }
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    compileOptions {
        // Backport java.lang.invoke.* (BootstrapMethodError, MethodHandle,
        // etc.) onto API 24/25. The default Android runtime added these in
        // API 26 (Oreo). PluginManager / Tauri / Kotlin-generated code
        // reference them via invokedynamic, so without desugaring the app
        // crashes at startup on Android 7.x with NoClassDefFoundError.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        jniLibs {
            // Older Android (API 24-25, including some Nox builds) and a few
            // OEM ROMs choke on uncompressed shared libraries (the modern
            // default) when the APK is sideloaded. Force-extract native libs
            // so libbox.so / libmint_lib.so are guaranteed to load.
            useLegacyPackaging = true
        }
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")