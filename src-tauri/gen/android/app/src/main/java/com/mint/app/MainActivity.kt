package com.mint.app

import android.os.Bundle
import android.os.Build

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try { androidx.activity.enableEdgeToEdge(this) } catch (_: Throwable) {}
    }
    super.onCreate(savedInstanceState)
  }
}
