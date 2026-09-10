package com.elliotoffice.projectionmapper

import android.app.Presentation
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.Display
import android.view.SurfaceView
import android.view.WindowManager

/**
 * Module 1 — Display & Rendering Daemon (Android).
 *
 * Wraps [android.app.Presentation] to push a full-screen render surface onto
 * an external HDMI / USB-C display, mirroring what [DisplayDaemon] on
 * Windows does with a borderless popup window. The render engine (Module 3)
 * attaches its GL context to [surfaceView]'s surface once [onCreate] runs.
 */
class ProjectorPresentation(
    outerContext: Context,
    display: Display,
) : Presentation(outerContext, display) {

    lateinit var surfaceView: SurfaceView
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // No title bar / system chrome: this is a pure output surface.
        window?.requestFeature(android.view.Window.FEATURE_NO_TITLE)
        window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.BLACK))
        window?.setFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        )

        surfaceView = SurfaceView(context)
        setContentView(surfaceView)
    }
}
