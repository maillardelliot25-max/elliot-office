package com.elliotoffice.projectionmapper

import android.content.Context
import android.hardware.display.DisplayManager
import android.view.Display
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result

/**
 * Flutter Android platform plugin wiring [ProjectorPresentation] to the Dart
 * side over the same channel name the Windows plugin uses
 * ("com.elliotoffice.projection_mapper/display"), so `display_service.dart`
 * (Module 4) talks to one API regardless of platform.
 */
class DisplayDaemonPlugin : FlutterPlugin, MethodCallHandler {

    private lateinit var channel: MethodChannel
    private lateinit var appContext: Context
    private var presentation: ProjectorPresentation? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL_NAME)
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        presentation?.dismiss()
        presentation = null
    }

    override fun onMethodCall(call: MethodCall, result: Result) {
        val displayManager =
            appContext.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

        when (call.method) {
            "listDisplays" -> {
                val displays = displayManager.displays.map { display -> displayToMap(display) }
                result.success(displays)
            }

            "sendToProjector" -> {
                val displayId = call.argument<String>("displayId")
                if (displayId == null) {
                    result.error("bad_args", "Missing displayId", null)
                    return
                }
                val target = displayManager.displays.firstOrNull { it.displayId.toString() == displayId }
                if (target == null) {
                    result.error("display_not_found", "No connected display matches id $displayId", null)
                    return
                }

                presentation?.dismiss()
                val newPresentation = ProjectorPresentation(appContext, target)
                newPresentation.show()
                presentation = newPresentation

                result.success(target.displayId.toLong())
            }

            "closeProjector" -> {
                presentation?.dismiss()
                presentation = null
                result.success(null)
            }

            "hasActiveProjectorWindow" -> {
                result.success(presentation != null)
            }

            else -> result.notImplemented()
        }
    }

    private fun displayToMap(display: Display): Map<String, Any> {
        val size = android.graphics.Point()
        @Suppress("DEPRECATION")
        display.getRealSize(size)

        return mapOf(
            "id" to display.displayId.toString(),
            "deviceName" to display.name,
            "x" to 0,
            "y" to 0,
            "width" to size.x,
            "height" to size.y,
            "isPrimary" to (display.displayId == Display.DEFAULT_DISPLAY),
        )
    }

    companion object {
        const val CHANNEL_NAME = "com.elliotoffice.projection_mapper/display"
    }
}
