package com.example.gpxeditor.controller

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.preference.PreferenceManager
import com.example.gpxeditor.view.fragments.CompareFragment
import com.example.gpxeditor.view.fragments.CreateFragment
import com.example.gpxeditor.view.fragments.HomeFragment
import com.example.gpxeditor.R
import com.example.gpxeditor.view.fragments.SavedRoutesFragment
import com.example.gpxeditor.view.fragments.SettingsFragment
import com.example.gpxeditor.model.services.MiServicio
import com.google.android.material.bottomnavigation.BottomNavigationView

class MainActivity : AppCompatActivity(), HomeFragment.NavigationListener, SharedPreferences.OnSharedPreferenceChangeListener {

    private val READ_STORAGE_PERMISSION_CODE = 101
    private lateinit var sharedPreferences: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this)
        sharedPreferences.registerOnSharedPreferenceChangeListener(this)

        val bottomNavigationView: BottomNavigationView = findViewById(R.id.bottom_navigation)

        bottomNavigationView.setOnItemSelectedListener { item ->
            val fragment = when (item.itemId) {
                R.id.nav_home -> HomeFragment()
                R.id.nav_compare -> CompareFragment()
                R.id.nav_create -> CreateFragment()
                R.id.nav_settings -> SettingsFragment()
                R.id.nav_saved_routes -> SavedRoutesFragment()
                else -> null
            }
            if (fragment != null) {
                changeFragmentWithConfirmation(fragment)
            }
            true
        }

        if (savedInstanceState == null) {
            loadFragment(HomeFragment())
        }

        handleIntent()
        aplicarPreferenciasIniciales()
    }

    private fun loadFragment(fragment: Fragment, tag: String? = null) {
        val transaction = supportFragmentManager.beginTransaction()
        if (tag != null) {
            transaction.replace(R.id.fragment_container, fragment, tag)
        } else {
            transaction.replace(R.id.fragment_container, fragment)
        }
        transaction.commit()
    }

    override fun onResume() {
        super.onResume()
        startService(Intent(this, MiServicio::class.java))
    }

    override fun onPause() {
        super.onPause()
        stopService(Intent(this, MiServicio::class.java))
    }

    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setMessage("¿Seguro que quieres salir?")
            .setCancelable(false)
            .setPositiveButton("Sí") { _, _ ->
                super.onBackPressed() // Cierra la aplicación
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun handleIntent() {
        val intent = intent
        val action = intent.action
        val data = intent.data

        if (Intent.ACTION_VIEW == action && data != null) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                passUriToFragment(data)
            } else {
                ActivityCompat.requestPermissions(this, arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE), READ_STORAGE_PERMISSION_CODE)
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == READ_STORAGE_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                intent.data?.let { passUriToFragment(it) }
            } else {
                // Permiso denegado, muestra un mensaje al usuario
            }
        }
    }

    private fun passUriToFragment(uri: Uri) {
        val homeFragment = supportFragmentManager.findFragmentById(R.id.fragment_container) as? HomeFragment
        homeFragment?.openGpxFile(uri)
    }

    fun changeFragmentWithConfirmation(fragment: Fragment) {
        Log.d("MainActivity", "changeFragmentWithConfirmation: fragment = $fragment")

        val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)

        when (currentFragment) {
            is CreateFragment -> currentFragment.onNavigationAttempt(this, fragment)
            is HomeFragment -> currentFragment.onNavigationAttempt(this, fragment)
            else -> loadFragment(fragment)
        }
    }

    override fun navigateToFragment(fragment: Fragment) {
        loadFragment(fragment)
    }

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        when (key) {
            "dark_mode" -> aplicarModoOscuro()
            "user_name" -> aplicarNombreUsuario()
            "notifications_enabled" -> aplicarNotificaciones()
        }
    }

    private fun aplicarPreferenciasIniciales() {
        aplicarModoOscuro()
        aplicarNombreUsuario()
        aplicarNotificaciones()
    }

    private fun aplicarModoOscuro() {
        val darkModeEnabled = sharedPreferences.getBoolean("dark_mode", false)
        if (darkModeEnabled) {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        } else {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        }
    }

    private fun aplicarNombreUsuario() {
        val userName = sharedPreferences.getString("user_name", "")
        Log.d("MainActivity", "Nombre de usuario: $userName")
    }

    private fun aplicarNotificaciones() {
        val notificationsEnabled = sharedPreferences.getBoolean("notifications_enabled", true)
        Log.d("MainActivity", "Notificaciones activadas: $notificationsEnabled")
    }

    override fun onDestroy() {
        super.onDestroy()
        sharedPreferences.unregisterOnSharedPreferenceChangeListener(this)
    }
}