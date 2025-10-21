import { initializeApp } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-database.js";

// 🔧 Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAf0oQbbv5GOfEBRWVgJ-0K8R467LHPeOE",
  authDomain: "mi-pagina-de-escritora.firebaseapp.com",
  databaseURL: "https://mi-pagina-de-escritora-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mi-pagina-de-escritora",
  storageBucket: "mi-pagina-de-escritora.appspot.com",
  messagingSenderId: "984725119846",
  appId: "1:984725119846:web:fcc1349bb15d7f9dcadea7"
};

// 🔌 Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ===============================
// 📌 RESEÑAS
// ===============================
document.getElementById("comentarioForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const usuario = document.getElementById("usuario").value.trim();
  const texto = document.getElementById("texto").value.trim();
  const libro = document.getElementById("libro").value;
  const calificacion = document.querySelector('input[name="calificacion"]:checked')?.value;

  if (!usuario || !texto || !libro || !calificacion) {
    alert("Por favor, completa todos los campos.");
    return;
  }

  const comentario = {
    usuario,
    texto,
    calificacion: Number(calificacion),
    fecha: new Date().toISOString()
  };

  push(ref(db, `libros/${libro}/comentarios`), comentario)
    .then(() => {
      const mensaje = document.getElementById("mensajeExito");
      mensaje.textContent = "✅ ¡Gracias! Tu comentario se ha enviado con éxito. ✨";
      mensaje.style.display = "block";
      mensaje.style.opacity = "1";

      setTimeout(() => {
        mensaje.style.opacity = "0";
        setTimeout(() => { mensaje.style.display = "none"; }, 500);
      }, 4000);

      e.target.reset();
    })
    .catch((error) => {
      console.error("❌ Error al enviar el comentario:", error);
      alert("Hubo un problema al enviar su comentario. Intente nuevamente.");
    });
});

// Mostrar comentarios de todos los libros
const lista = document.getElementById("listaComentarios");
const libros = ["Más allá de la pared", "PACO MERTenterito", "Los cuentos de mi abuela"];

// Limpiar lista una sola vez al cargar
lista.innerHTML = "";

libros.forEach(libro => {
  const comentariosRef = ref(db, `libros/${libro}/comentarios`);
  onValue(comentariosRef, (snapshot) => {
    const comentarios = snapshot.val();
    if (comentarios) {
      Object.values(comentarios).forEach(({ usuario, texto, fecha, calificacion }) => {
        const item = document.createElement("li");
        item.innerHTML = `
          <strong>${usuario}</strong> reseñó <em>${libro}</em>:
          <br>"${texto}"
          <br>📝 Calificación: ${"⭐".repeat(calificacion)} 
          <br><small>(${new Date(fecha).toLocaleString()})</small>
        `;
        lista.appendChild(item); // ✅ Se van acumulando
      });
    }
  });
});

// ===============================
// 🛒 CARRITO + PAYPAL
// ===============================
let carrito = [];
let total = 0;

window.agregarAlCarrito = function(nombre, precio) {
  carrito.push({ nombre, precio });
  total += precio;
  renderCarrito();
};

function renderCarrito() {
  const lista = document.getElementById("carrito-lista");
  lista.innerHTML = "";

  if (carrito.length > 0) {
    const li = document.createElement("li");
    li.innerHTML = `<button onclick="vaciarCarrito()">🗑️ Vaciar carrito</button>`;
    lista.appendChild(li);

    carrito.forEach(item => {
      const liItem = document.createElement("li");
      liItem.textContent = `${item.nombre} - ${item.precio.toFixed(2)} €`;
      lista.appendChild(liItem);
    });
  }

  document.getElementById("total").textContent = total.toFixed(2);
}

window.vaciarCarrito = function() {
  carrito = [];
  total = 0;
  renderCarrito();
};

// Inicializar PayPal
paypal.Buttons({
  createOrder: function(data, actions) {
    return actions.order.create({
      purchase_units: [{ amount: { value: total.toFixed(2) } }]
    });
  },
  onApprove: function(data, actions) {
    return actions.order.capture().then(function(details) {
      alert("✅ Pago completado por " + details.payer.name.given_name);
      carrito = [];
      total = 0;
      renderCarrito();
    });
  },
  onError: function(err) {
    console.error("❌ Error en el pago:", err);
    alert("Hubo un problema con el pago.");
  }
}).render('#paypal-button-container');
