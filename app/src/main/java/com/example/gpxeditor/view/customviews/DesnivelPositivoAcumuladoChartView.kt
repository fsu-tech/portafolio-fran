package com.example.gpxeditor.view.customviews

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import androidx.core.content.ContextCompat
import android.content.res.Configuration
import com.example.gpxeditor.R

class DesnivelPositivoAcumuladoChartView(
    context: Context,
    private val desnivelPositivo1: Double,
    private val desnivelPositivo2: Double
) : View(context) {

    private val isDarkMode = isDarkMode(context)

    private val paint1 = Paint().apply {
        color = if (isDarkMode) ContextCompat.getColor(context, R.color.bar_color_dark_magenta) else ContextCompat.getColor(context,
            R.color.bar_color_light_magenta
        )
        strokeWidth = 50f
    }

    private val paint2 = Paint().apply {
        color = if (isDarkMode) ContextCompat.getColor(context, R.color.bar_color_dark_cyan) else ContextCompat.getColor(context,
            R.color.bar_color_light_cyan
        )
        strokeWidth = 50f
    }

    private val textPaint = Paint().apply {
        color = if (isDarkMode) ContextCompat.getColor(context, R.color.chart_text_dark) else ContextCompat.getColor(context,
            R.color.chart_text_light
        )
        textSize = 30f
        textAlign = Paint.Align.CENTER
    }

    private var viewWidth: Float = 0f
    private var viewHeight: Float = 0f

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        viewWidth = w.toFloat()
        viewHeight = h.toFloat()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val maxDesnivel = maxOf(desnivelPositivo1, desnivelPositivo2).toFloat()
        if (maxDesnivel == 0f) return

        val barWidth = viewWidth / 3f
        val maxBarHeight = viewHeight * 0.6f

        paint1.strokeWidth = barWidth / 2
        paint2.strokeWidth = barWidth / 2

        // Barra 1 (Desnivel Positivo 1)
        val bar1Height = (desnivelPositivo1 / maxDesnivel) * maxBarHeight

        val bar1Left = barWidth / 2f
        val bar1Top = viewHeight - bar1Height - (barWidth / 2)
        val bar1Right = bar1Left + barWidth / 2f
        val bar1Bottom = viewHeight - (barWidth / 2)

        canvas.drawRect(bar1Left, bar1Top.toFloat(), bar1Right, bar1Bottom, paint1)
        canvas.drawText(String.format("%.2f m", desnivelPositivo1), bar1Left + barWidth / 4f, (bar1Top - 10f).toFloat(), textPaint)

        canvas.drawText("Ruta 1", bar1Left + barWidth / 4f, viewHeight - (barWidth / 2) + 20f, textPaint)

        // Barra 2 (Desnivel Positivo 2)
        val bar2Height = (desnivelPositivo2 / maxDesnivel) * maxBarHeight

        val bar2Left = barWidth * 1.5f
        val bar2Top = viewHeight - bar2Height - (barWidth / 2)
        val bar2Right = bar2Left + barWidth / 2f
        val bar2Bottom = viewHeight - (barWidth / 2)

        canvas.drawRect(bar2Left, bar2Top.toFloat(), bar2Right, bar2Bottom, paint2)
        canvas.drawText(String.format("%.2f m", desnivelPositivo2), bar2Left + barWidth / 4f, (bar2Top - 10f).toFloat(), textPaint)

        canvas.drawText("Ruta 2", bar2Left + barWidth / 4f, viewHeight - (barWidth / 2) + 20f, textPaint)
    }

    private fun isDarkMode(context: Context): Boolean {
        return when (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
            Configuration.UI_MODE_NIGHT_YES -> true
            else -> false
        }
    }
}