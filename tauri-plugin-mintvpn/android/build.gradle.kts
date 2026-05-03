plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mint.vpn"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

repositories {
    flatDir {
        dirs("libs")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.android.material:material:1.12.0")
    // sing-box (libbox.aar) — built in CI via gomobile from
    // github.com/sagernet/sing-box//experimental/libbox and copied into
    // tauri-plugin-mintvpn/android/libs/. If absent the plugin still compiles
    // because the Kotlin sources stub out every libbox reference behind a
    // reflection-based bridge (see MintLibbox.kt) — the real engine just
    // won't start.
    compileOnly(fileTree("libs") { include("*.aar") })
    runtimeOnly(fileTree("libs") { include("*.aar") })
    implementation(project(":tauri-android"))
}
