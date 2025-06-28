package com.example.gpxeditor.view.fragments

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.location.Location
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.text.Html
import android.text.method.LinkMovementMethod
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.example.gpxeditor.R
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserException
import java.io.IOException
import java.io.InputStream
import com.example.gpxeditor.model.database.DatabaseHelper
import org.osmdroid.views.overlay.Overlay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.xmlpull.v1.XmlPullParserFactory
import java.text.ParseException

class HomeFragment : Fragment(R.layout.fragment_home) {
    private lateinit var mapView: MapView
    private val READ_STORAGE_PERMISSION_CODE = 101
    private val LOCATION_PERMISSION_CODE = 102
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var locationMarker: Marker? = null
    private var polyline: Polyline? = null
    private val gpxOverlays = mutableListOf<Overlay>()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var loadJob: Job? = null
    private var isNavigating = false
    private var lastLocation: Location? = null
    private var isAppClosing = false
    private var isLocationUpdatesActive = false
    private var currentTimes: Pair<Long?, Long?>? = null
    private lateinit var sharedPreferences: SharedPreferences
    private val gson = Gson()
    private val RUTA_POINTS_KEY = "ruta_points"
    private val WAYPOINTS_KEY = "waypoints"
    private val ELEVATIONS_KEY = "elevations"
    private val CURRENT_ROUTE_NAME_KEY = "current_route_name"

    private var currentPoints: List<GeoPoint>? = null
    private var currentWaypoints: List<WaypointInfo>? = null
    private var currentElevations: List<Double>? = null
    private var currentRouteName: String? = null

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            if (isAdded && isResumed) {
                locationResult.lastLocation?.let { location ->
                    updateUserLocation(GeoPoint(location.latitude, location.longitude))
                    lastLocation = location
                }
            }
        }
    }

    data class WaypointInfo(
        val geoPoint: GeoPoint,
        var name: String,
        var description: String,
        var photoUrl: String,
        var userPhotoUrl: String = "",
        var time: Long? = null
    )

    override fun onAttach(context: Context) {
        super.onAttach(context)
        sharedPreferences = context.getSharedPreferences("ruta_data", Context.MODE_PRIVATE)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        Configuration.getInstance().load(requireContext(), requireActivity().getPreferences(0))
        mapView = view.findViewById(R.id.mapView)
        mapView.setTileSource(TileSourceFactory.MAPNIK)
        mapView.setMultiTouchControls(true)

        val mapController = mapView.controller
        val startPoint = GeoPoint(40.4168, -3.7038)
        mapController.setZoom(12.0)
        mapController.setCenter(startPoint)

        val btnLoadGpx: Button = view.findViewById(R.id.btnLoadGpx)
        btnLoadGpx.setOnClickListener {
            selectGpxFile()
        }

        val btnSaveRoute: Button = view.findViewById(R.id.btnRouteInfo)
        btnSaveRoute.text = "Guardar Ruta"
        btnSaveRoute.setOnClickListener {
            guardarRutaEnBaseDeDatos()
        }

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(requireActivity())
        requestLocationPermissions()

        handleIntent()

        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                limpiarRecursos()
                requireActivity().finish()
            }
        })
        restoreRouteFromPrefs()
    }

    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.data?.let { uri ->
                loadGpxFromUri(uri)
            }
        }
    }

    private fun limpiarRecursos() {
        Log.d("HomeFragment", "limpiarRecursos called")
        fusedLocationClient.removeLocationUpdates(locationCallback)
        isLocationUpdatesActive = false
        lastLocation = null
        mapView.overlays.removeAll(gpxOverlays.toList())
        gpxOverlays.clear()
        mapView.invalidate()
        loadJob?.cancel()
        loadJob = null
        limpiarRutaEnSharedPreferences()
    }

    private fun limpiarRutaEnSharedPreferences() {
        Log.d("HomeFragment", "limpiarRutaEnSharedPreferences called")
        val editor = sharedPreferences.edit()
        editor.remove(RUTA_POINTS_KEY)
        editor.remove(WAYPOINTS_KEY)
        editor.remove(ELEVATIONS_KEY)
        editor.remove(CURRENT_ROUTE_NAME_KEY)
        editor.apply()
    }

    fun openGpxFile(uri: Uri) {
        loadGpxFromUri(uri)
    }

    private fun loadGpxFromUri(uri: Uri) {
        loadJob = scope.launch(Dispatchers.IO) {
            try {
                requireActivity().contentResolver.openInputStream(uri)?.use { inputStream ->
                    val (routeData, waypoints, routeName) = parseGpx(inputStream)
                    val (points, elevations, times) = routeData
                    withContext(Dispatchers.Main) {
                        if (isActive && isAdded && view != null) {
                            currentPoints = points
                            currentWaypoints = waypoints
                            currentElevations = elevations
                            currentRouteName = routeName
                            currentTimes = times

                            drawGpxRoute(points, waypoints)

                            guardarRutaEnSharedPreferences(points, waypoints, elevations, routeName)
                        }
                    }
                }
            } catch (e: IOException) {
                withContext(Dispatchers.Main) {
                    if (isAdded && view != null) {
                        Toast.makeText(requireContext(), "Error al leer el archivo GPX", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: XmlPullParserException) {
                withContext(Dispatchers.Main) {
                    if (isAdded && view != null) {
                        Toast.makeText(requireContext(), "Error al analizar el archivo GPX", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun guardarRutaEnSharedPreferences(points: List<GeoPoint>, waypoints: List<WaypointInfo>, elevations: List<Double>, routeName: String?) {
        val editor = sharedPreferences.edit()

        val pointsJson = gson.toJson(points)
        val waypointsJson = gson.toJson(waypoints)
        val elevationsJson = gson.toJson(elevations)

        editor.putString(RUTA_POINTS_KEY, pointsJson)
        editor.putString(WAYPOINTS_KEY, waypointsJson)
        editor.putString(ELEVATIONS_KEY, elevationsJson)
        editor.putString(CURRENT_ROUTE_NAME_KEY, routeName)

        editor.apply()
    }

    private fun selectGpxFile() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            launchFilePicker()
        } else {
            ActivityCompat.requestPermissions(requireActivity(), arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE), READ_STORAGE_PERMISSION_CODE)
        }
    }

    private fun launchFilePicker() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "application/gpx+xml"
        }
        filePickerLauncher.launch(intent)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            READ_STORAGE_PERMISSION_CODE -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    launchFilePicker()
                } else {
                    Toast.makeText(requireContext(), "Permiso de almacenamiento denegado", Toast.LENGTH_SHORT).show()
                }
            }
            LOCATION_PERMISSION_CODE -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    startLocationUpdates()
                } else {
                    Toast.makeText(requireContext(), "Permiso de ubicación denegado", Toast.LENGTH_SHORT).show()
                }
            }
            NOTIFICATION_PERMISSION_REQUEST_CODE -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    // Permiso concedido
                    // Continúa con la lógica de notificación
                } else {
                    // Permiso denegado
                    // Maneja el caso en que el usuario deniega el permiso
                    Toast.makeText(requireContext(), "Permiso de notificaciones denegado", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun handleIntent() {
        val intent = requireActivity().intent
        val action = intent.action
        val data = intent.data

        if (Intent.ACTION_VIEW == action && data != null) {
            openGpxFile(data)
        }
    }

    private fun parseGpx(inputStream: InputStream): Triple<Triple<List<GeoPoint>, List<Double>, Pair<Long?, Long?>>, List<WaypointInfo>, String?> {
        val points = mutableListOf<GeoPoint>()
        val elevations = mutableListOf<Double>()
        val waypoints = mutableListOf<WaypointInfo>()
        val factory = XmlPullParserFactory.newInstance()
        val parser = factory.newPullParser()
        parser.setInput(inputStream, null)

        var eventType = parser.eventType
        var lat = 0.0
        var lon = 0.0
        var name = ""
        var desc = "" // Inicialmente vacía, se llenará con name si no hay desc
        var photoUrl = ""
        var ele = 0.0
        var routeName: String? = null
        var startTime: Long? = null
        var endTime: Long? = null
        var isInsideTrkpt = false

        // Intentar parsear la fecha con diferentes formatos comunes
        val dateFormats = arrayOf(
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US),
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US),
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US),
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US) // Para formatos con offset
        )

        while (eventType != XmlPullParser.END_DOCUMENT) {
            if (eventType == XmlPullParser.START_TAG) {
                when (parser.name) {
                    "trkpt" -> {
                        lat = parser.getAttributeValue(null, "lat").toDouble()
                        lon = parser.getAttributeValue(null, "lon").toDouble()
                        isInsideTrkpt = true
                        Log.d("GPXParser", "Punto encontrado: lat=$lat, lon=$lon")
                    }
                    "wpt" -> {
                        lat = parser.getAttributeValue(null, "lat").toDouble()
                        lon = parser.getAttributeValue(null, "lon").toDouble()
                        name = ""
                        desc = "" // Reiniciar para cada waypoint
                        photoUrl = ""
                        Log.d("GPXParser", "Waypoint encontrado: lat=$lat, lon=$lon")
                    }
                    "name" -> {
                        if (parser.next() == XmlPullParser.TEXT) {
                            val text = parser.text.trim()
                            if (routeName == null) {
                                routeName = text
                                Log.d("GPXParser", "Nombre de ruta encontrado: $routeName")
                            } else {
                                name = text
                                desc = text // Usar el nombre como descripción por defecto
                                Log.d("GPXParser", "Nombre de waypoint encontrado: $name")
                            }
                        }
                    }
                    "desc", "cmt" -> { // Soporte para desc y cmt
                        while (parser.next() != XmlPullParser.END_TAG && parser.eventType != XmlPullParser.END_DOCUMENT) {
                            if (parser.eventType == XmlPullParser.TEXT) {
                                val text = parser.text.trim()
                                if (text.isNotEmpty()) { // Solo actualizar si hay texto
                                    desc = text
                                    Log.d("GPXParser", "Descripción encontrada en <${parser.name}>: $desc")
                                }
                                break
                            }
                        }
                        if (desc.isEmpty()) {
                            Log.d("GPXParser", "No se encontró texto válido en <${parser.name}>")
                        }
                    }
                    "link" -> {
                        photoUrl = parser.getAttributeValue(null, "href")
                        Log.d("GPXParser", "Foto encontrada: $photoUrl")
                    }
                    "ele" -> {
                        if (parser.next() == XmlPullParser.TEXT) {
                            ele = parser.text.toDouble()
                            elevations.add(ele)
                            Log.d("GPXParser", "Elevación encontrada: $ele")
                        }
                    }
                    "time" -> {
                        if (parser.next() == XmlPullParser.TEXT && isInsideTrkpt) {
                            val timeString = parser.text
                            var parsedDate: Date? = null
                            for (format in dateFormats) {
                                try {
                                    parsedDate = format.parse(timeString)
                                    break // Si se parsea con éxito, salir del bucle
                                } catch (e: ParseException) {
                                    // Intentar con el siguiente formato
                                }
                            }

                            parsedDate?.let {
                                val timeMillis = it.time
                                if (startTime == null) {
                                    startTime = timeMillis
                                    Log.d("GPXParser", "Tiempo de inicio encontrado: $startTime")
                                }
                                endTime = timeMillis
                                Log.d("GPXParser", "Tiempo encontrado: $endTime")
                            } ?: run {
                                Log.e("GPXParser", "Error al parsear el tiempo: Formato desconocido: $timeString")
                            }
                        }
                    }
                }
            } else if (eventType == XmlPullParser.END_TAG) {
                when (parser.name) {
                    "trkpt" -> {
                        points.add(GeoPoint(lat, lon))
                        isInsideTrkpt = false
                    }
                    "wpt" -> {
                        if (desc.isEmpty()) desc = name // Asegurar que desc tenga al menos el nombre
                        waypoints.add(WaypointInfo(GeoPoint(lat, lon), name, desc, photoUrl))
                        Log.d("GPXParser", "Waypoint añadido: name=$name, desc=$desc, photoUrl=$photoUrl")
                    }
                }
            }
            eventType = parser.next()
        }

        Log.d("GPXParser", "Tiempos extraídos: startTime=$startTime, endTime=$endTime")
        Log.d("GPXParser", "Total waypoints procesados: ${waypoints.size}")

        return Triple(Triple(points, elevations, Pair(startTime, endTime)), waypoints, routeName)
    }



    private fun drawGpxRoute(points: List<GeoPoint>, waypoints: List<WaypointInfo>) {
        mapView.overlays.removeAll(gpxOverlays.toList())
        gpxOverlays.clear()

        if (points.isEmpty()) {
            Toast.makeText(requireContext(), "No se encontraron puntos de ruta en el archivo GPX", Toast.LENGTH_SHORT).show()
            return
        }

        polyline = Polyline()
        polyline?.let {
            it.setPoints(points)
            gpxOverlays.add(it)
            mapView.overlays.add(it)
        }

        mapView.controller.setCenter(points.first())
        mapView.controller.setZoom(15.0)

        val startMarker = Marker(mapView)
        startMarker.position = points.first()
        startMarker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        startMarker.title = "Inicio de la ruta"
        startMarker.icon.setTint(Color.GREEN)
        gpxOverlays.add(startMarker)
        mapView.overlays.add(startMarker)

        val endMarker = Marker(mapView)
        endMarker.position = points.last()
        endMarker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        endMarker.title = "Fin de la ruta"
        endMarker.icon.setTint(Color.RED)
        gpxOverlays.add(endMarker)
        mapView.overlays.add(endMarker)

        waypoints.forEach { waypointInfo ->
            val waypointMarker = Marker(mapView)
            waypointMarker.position = waypointInfo.geoPoint
            waypointMarker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            waypointMarker.title = waypointInfo.name
            waypointMarker.snippet = waypointInfo.description
            waypointMarker.icon.setTint(Color.BLUE)

            waypointMarker.setOnMarkerClickListener { marker, _ ->
                showWaypointDialog(waypointInfo)
                true
            }

            gpxOverlays.add(waypointMarker)
            mapView.overlays.add(waypointMarker)
        }

        mapView.invalidate()
    }

    private fun showWaypointDialog(waypointInfo: WaypointInfo) {
        val builder = AlertDialog.Builder(requireContext())


        val photoUrl = if (waypointInfo.userPhotoUrl.isNotEmpty()) {
            waypointInfo.userPhotoUrl
        } else {
            waypointInfo.photoUrl
        }

        val message = if (photoUrl.isNotEmpty()) {
            Html.fromHtml("${waypointInfo.description}<br><a href=\"$photoUrl\">Ver foto</a>")
        } else {
            waypointInfo.description
        }

        builder.setMessage(message) // Mostrar el mensaje con o sin el link.
        builder.setPositiveButton("Cerrar", null)
        builder.setNeutralButton("Añadir/Editar foto y comentario") { _, _ ->
            showAddPhotoDialog(waypointInfo)
        }

        val dialog = builder.create()
        dialog.show()

        dialog.findViewById<TextView>(android.R.id.message)?.let { messageTextView ->
            messageTextView.movementMethod = LinkMovementMethod.getInstance()

            if (photoUrl.isNotEmpty()) {
                messageTextView.setOnClickListener {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(photoUrl))
                        startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(requireContext(), "No se puede abrir la foto", Toast.LENGTH_SHORT).show()
                        e.printStackTrace()
                    }
                }
            }
        }
    }

    private fun showAddPhotoDialog(waypointInfo: WaypointInfo) {
        val view = LayoutInflater.from(requireContext()).inflate(R.layout.dialog_add_photo, null)
        val etPhotoUrl = view.findViewById<EditText>(R.id.et_photo_url)
        val etDescription = view.findViewById<EditText>(R.id.et_description) // Obtener el EditText de la descripción

        etPhotoUrl.setText(waypointInfo.userPhotoUrl)
        etDescription.setText(waypointInfo.description) // Establecer la descripción existente

        AlertDialog.Builder(requireContext())
            .setView(view)
            .setTitle("Añadir/Editar foto y descripción") // Actualizar el título
            .setPositiveButton("Guardar") { _, _ ->
                waypointInfo.userPhotoUrl = etPhotoUrl.text.toString()
                waypointInfo.description = etDescription.text.toString() // Actualizar la descripción
                guardarRutaEnSharedPreferences(currentPoints!!, currentWaypoints!!, currentElevations!!, currentRouteName)
                drawGpxRoute(currentPoints!!, currentWaypoints!!)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun requestLocationPermissions() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(requireActivity(), arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), LOCATION_PERMISSION_CODE)
        } else {
            startLocationUpdates()
        }
    }

    private fun startLocationUpdates() {
        val locationRequest = LocationRequest.create().apply {
            interval = 5000
            fastestInterval = 3000
            priority = LocationRequest.PRIORITY_HIGH_ACCURACY
        }

        if (ActivityCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
            isLocationUpdatesActive = true
        }
    }

    private fun updateUserLocation(geoPoint: GeoPoint) {
        if (isAdded && isResumed && mapView != null) {
            if (locationMarker == null) {
                locationMarker = Marker(mapView)
                val icon: Drawable? = ContextCompat.getDrawable(requireContext(),
                    R.drawable.ic_blue_dot
                )
                locationMarker?.icon = icon
                mapView.overlays.add(locationMarker)
            }

            locationMarker?.position = geoPoint
            mapView.invalidate()

            val currentPolyline = polyline
            val distance = currentPolyline?.let { calculateDistanceToRoute(geoPoint, it.points) } ?: Float.MAX_VALUE

            if (distance <= 1000) {
                mapView.controller.animateTo(geoPoint)
            }
        }
    }

    private fun calculateDistanceToRoute(userLocation: GeoPoint, routePoints: List<GeoPoint>): Float {
        if (routePoints.isEmpty()) return Float.MAX_VALUE

        val userLocationLocation = Location("user").apply {
            latitude = userLocation.latitude
            longitude = userLocation.longitude
        }

        var minDistance = Float.MAX_VALUE

        for (i in 0 until routePoints.size - 1) {
            val startPoint = routePoints[i]
            val endPoint = routePoints[i + 1]

            val startLocation = Location("start").apply {
                latitude = startPoint.latitude
                longitude = startPoint.longitude
            }
            val endLocation = Location("end").apply {
                latitude = endPoint.latitude
                longitude = endPoint.longitude
            }

            val distance = calculateDistanceToSegment(userLocationLocation, startLocation, endLocation)
            minDistance = minOf(minDistance, distance)
        }

        return minDistance
    }

    private fun calculateDistanceToSegment(userLocation: Location, startLocation: Location, endLocation: Location): Float {
        val px = endLocation.longitude - startLocation.longitude
        val py = endLocation.latitude - startLocation.latitude
        val temp = (px * px) + (py * py)

        if (temp > 0) {
            val u = ((userLocation.longitude - startLocation.longitude) * px + (userLocation.latitude - startLocation.latitude) * py) / temp

            if (u > 1) {
                return userLocation.distanceTo(endLocation)
            } else if (u < 0) {
                return userLocation.distanceTo(startLocation)
            } else {
                val x = startLocation.longitude + u * px
                val y = startLocation.latitude + u * py

                val segmentLocation = Location("segment").apply {
                    latitude = y
                    longitude = x
                }

                return userLocation.distanceTo(segmentLocation)
            }
        } else {
            return userLocation.distanceTo(startLocation)
        }
    }

    private fun guardarRutaEnBaseDeDatos() {
        Log.d("guardarRuta", "Inicio de guardarRutaEnBaseDeDatos")

        if (currentPoints != null && currentWaypoints != null && currentElevations != null) {
            Log.d("guardarRuta", "Datos de ruta presentes")

            val currentDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            Log.d("guardarRuta", "Fecha actual: $currentDate")

            val puntos = currentPoints!!.mapIndexed { index, geoPoint ->
                Triple(geoPoint.latitude, geoPoint.longitude, currentElevations!!.getOrElse(index) { 0.0 })
            }
            Log.d("guardarRuta", "Puntos transformados: ${puntos.size} puntos")

            val puntosInteres = currentWaypoints!!.map { waypointInfo ->
                Log.d("guardarRuta", "Procesando waypoint: ${waypointInfo.name}, userPhotoUrl: ${waypointInfo.userPhotoUrl}")
                // Corrección: evitar duplicación si name y description son iguales
                val comentario = if (waypointInfo.name == waypointInfo.description) {
                    waypointInfo.name
                } else {
                    "${waypointInfo.name}\n${waypointInfo.description}"
                }
                DatabaseHelper.PuntoInteresData(
                    0, // Añadir valor para id, puede ser 0 o -1
                    waypointInfo.geoPoint.latitude,
                    waypointInfo.geoPoint.longitude.toString(),
                    comentario,
                    waypointInfo.photoUrl,
                    waypointInfo.userPhotoUrl
                )
            }
            Log.d("guardarRuta", "Puntos de interés transformados: ${puntosInteres.size} puntos")

            val dbHelper = DatabaseHelper(requireContext())
            Log.d("guardarRuta", "DatabaseHelper inicializado")

            val startTime = currentTimes?.first ?: System.currentTimeMillis()
            val endTime = currentTimes?.second ?: startTime
            Log.d("guardarRuta", "Tiempos: startTime=$startTime, endTime=$endTime")

            val rutaId = dbHelper.insertRoute(
                currentRouteName ?: "Ruta sin nombre",
                currentDate,
                puntos,
                startTime,
                endTime,
                puntosInteres,
                "GPX"
            )
            Log.d("guardarRuta", "Ruta insertada, rutaId=$rutaId")

            if (rutaId != -1L) {
                Toast.makeText(requireContext(), "Ruta guardada en la base de datos", Toast.LENGTH_SHORT).show()
                Log.d("guardarRuta", "Ruta guardada con éxito")

                // Insignias ecológicas
                val rutasGuardadas = dbHelper.getAllRoutes()
                val fechaObtencion = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

                // Variables para el diálogo
                var mensajeInsignia = ""
                var mensajeEcologico = ""

                // Semilla de Sendero
                if (rutasGuardadas.size == 1) {
                    dbHelper.insertInsignia("Semilla de Sendero", fechaObtencion, rutaId, "Ecologica")
                    mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Semilla de Sendero!\n\n"
                    mensajeEcologico = "¡Cada paso cuenta! Sigue explorando y cuidando nuestros senderos."
                }

                // Rutas Verdes
                when (rutasGuardadas.size) {
                    10 -> {
                        dbHelper.insertInsignia("Rutas Verdes I", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Rutas Verdes I!\n\n"
                        mensajeEcologico = "¡Tu compromiso con las rutas verdes marca la diferencia! ¡Sigue así!"
                    }
                    25 -> {
                        dbHelper.insertInsignia("Rutas Verdes II", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Rutas Verdes II!\n\n"
                        mensajeEcologico = "¡Eres un verdadero defensor de la naturaleza! ¡Gracias por tu esfuerzo!"
                    }
                    50 -> {
                        dbHelper.insertInsignia("Rutas Verdes III", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Rutas Verdes III!\n\n"
                        mensajeEcologico = "¡Impresionante! ¡Tu pasión por la naturaleza es un ejemplo para todos!"
                    }
                }

                // Cartógrafo Ecológico
                if (currentWaypoints != null && currentWaypoints!!.size >= 5) {
                    dbHelper.insertInsignia("Cartógrafo Ecológico", fechaObtencion, rutaId, "Ecologica")
                    mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Cartógrafo Ecológico!\n\n"
                    mensajeEcologico = "¡Gracias por ayudarnos a mapear y proteger la naturaleza! ¡Tu contribución es invaluable!"
                }

                // Cronista de la Naturaleza
                val totalPuntosConInfoEcologica = dbHelper.obtenerTotalPuntosInteresConInfoEcologica()

                when (totalPuntosConInfoEcologica) {
                    10 -> {
                        dbHelper.insertInsignia("Cronista de la Naturaleza I", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Cronista de la Naturaleza I!\n\n"
                        mensajeEcologico = "¡Tus observaciones son valiosas para la conservación del entorno! ¡Sigue compartiendo tus conocimientos!"
                    }
                    25 -> {
                        dbHelper.insertInsignia("Cronista de la Naturaleza II", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Cronista de la Naturaleza II!\n\n"
                        mensajeEcologico = "¡Eres un cronista excepcional! ¡Tu dedicación a la naturaleza es admirable!"
                    }
                    50 -> {
                        dbHelper.insertInsignia("Cronista de la Naturaleza III", fechaObtencion, rutaId, "Ecologica")
                        mensajeInsignia = "¡Felicidades! ¡Has obtenido la insignia: Cronista de la Naturaleza III!\n\n"
                        mensajeEcologico = "¡Increíble! ¡Tu labor como cronista es fundamental para proteger nuestro planeta!"
                    }
                }

                // Mostrar el diálogo si hay mensajes
                if (mensajeInsignia.isNotEmpty() && mensajeEcologico.isNotEmpty()) {
                    mostrarDialogo(mensajeInsignia + mensajeEcologico)
                }

            } else {
                Toast.makeText(requireContext(), "Error al guardar la ruta", Toast.LENGTH_SHORT).show()
                Log.e("guardarRuta", "Error al guardar la ruta")
            }
        } else {
            Toast.makeText(requireContext(), "No hay ruta cargada para guardar", Toast.LENGTH_SHORT).show()
            Log.e("guardarRuta", "No hay ruta cargada para guardar")
        }
        Log.d("guardarRuta", "Fin de guardarRutaEnBaseDeDatos")
    }

    private fun mostrarDialogo(mensaje: String) {
        val builder = AlertDialog.Builder(requireContext())
        val dialogView = layoutInflater.inflate(R.layout.dialog_insignia, null)
        val insigniaMessage = dialogView.findViewById<TextView>(R.id.insignia_message)

        insigniaMessage.text = mensaje

        builder.setView(dialogView)
        builder.setPositiveButton("Aceptar") { dialog, _ ->
            dialog.dismiss()
        }
        val dialog = builder.create()
        dialog.show()
    }

    override fun onPause() {
        super.onPause()
        Log.d("HomeFragment", "onPause called")
        if (requireActivity().isFinishing) {
            isAppClosing = true
            limpiarRecursos()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    override fun onResume() {
        super.onResume()
        Log.d("HomeFragment", "onResume called")
        isNavigating = false
        restoreRouteFromPrefs()
        requestNotificationPermission() // Añade esta línea para solicitar el permiso
    }

    private fun restoreRouteFromPrefs() {
        Log.d("HomeFragment", "restoreRouteFromPrefs called")
        val routePointsJson = sharedPreferences.getString(RUTA_POINTS_KEY, null)
        val waypointsJson = sharedPreferences.getString(WAYPOINTS_KEY, null)
        val elevationsJson = sharedPreferences.getString(ELEVATIONS_KEY, null)
        val routeNameJson = sharedPreferences.getString(CURRENT_ROUTE_NAME_KEY, null)

        Log.d("HomeFragment", "routePointsJson: $routePointsJson")
        Log.d("HomeFragment", "waypointsJson: $waypointsJson")
        Log.d("HomeFragment", "elevationsJson: $elevationsJson")
        Log.d("HomeFragment", "routeNameJson: $routeNameJson")

        if (routePointsJson != null && waypointsJson != null && elevationsJson != null && routeNameJson != null) {
            val pointsType = object : TypeToken<List<GeoPoint>>() {}.type
            val waypointsType = object : TypeToken<List<WaypointInfo>>() {}.type
            val elevationsType = object : TypeToken<List<Double>>() {}.type

            val points: List<GeoPoint> = gson.fromJson(routePointsJson, pointsType)
            val waypoints: List<WaypointInfo> = gson.fromJson(waypointsJson, waypointsType)
            val elevations: List<Double> = gson.fromJson(elevationsJson, elevationsType)
            val routeName: String? = sharedPreferences.getString(CURRENT_ROUTE_NAME_KEY, null)

            Log.d("HomeFragment", "points: $points")
            Log.d("HomeFragment", "waypoints: $waypoints")
            Log.d("HomeFragment", "elevations: $elevations")
            Log.d("HomeFragment", "routeName: $routeName")

            currentPoints = points
            currentWaypoints = waypoints
            currentElevations = elevations
            currentRouteName = routeName

            drawGpxRoute(points, waypoints)
        } else {
            mapView.overlays.removeAll(gpxOverlays.toList())
            gpxOverlays.clear()
            mapView.invalidate()
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    requireContext(),
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                // Permiso ya concedido
                // Continúa con la lógica de notificación
            } else {
                // Solicitar permiso
                ActivityCompat.requestPermissions(
                    requireActivity(),
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                )
            }
        } else {
            // Versiones anteriores a Android 13, no se necesita permiso
            // Continúa con la lógica de notificación
        }
    }

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 123
    }

    fun onNavigationAttempt(listener: NavigationListener, fragment: Fragment) {
        listener.navigateToFragment(fragment)
    }

    interface NavigationListener {
        fun navigateToFragment(fragment: Fragment)
    }
}
