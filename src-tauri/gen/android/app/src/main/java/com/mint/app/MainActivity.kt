package com.mint.app

import android.os.Bundle
import android.os.Build
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try { enableEdgeToEdge() } catch (_: Throwable) {}
    }
    super.onCreate(savedInstanceState)
  }
}
