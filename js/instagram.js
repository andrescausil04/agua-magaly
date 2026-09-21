/**
 * AGUA MAGALY — CONTROLADOR DE PERFIL DE INSTAGRAM
 * Interacciones: Seguir/Dejar de seguir, Modal de Fotos, Likes, Comentarios en vivo y WhatsApp
 */

(function () {
  'use strict';

  const WHATSAPP_NUMBER = '573054136677';

  // Datos detallados de las publicaciones de Agua Magaly
  const POSTS_DATA = [
    {
      id: 1,
      image: 'assets/bolsa-3l.jpg',
      tag: '⭐ Paca de 3 Litros',
      likes: 412,
      isLiked: false,
      date: 'Hace 2 horas',
      caption: `💧 ¡NUEVA PACA DE AGUA DE 3 LITROS! 🏡✨\n\nPensada especialmente para los hogares de Bajo Grande y Sahagún. Una paca práctica, resistente y con el agua más pura y fresca que tu familia merece.\n\n💰 Precio directo de fábrica: ¡Solo $4.000 la paca!\n🛵 Domicilios inmediatos en Bajo Grande y Sahagún.\n📲 Pídela ya a nuestra línea directa de WhatsApp: 305 413 6677\n\n#AguaMagaly #BajoGrande #Sahagun #Cordoba #AguaPura #Paca3Litros #HidratacionFamiliar #EmprendimientoCordobes #AguaDeCalidad`,
      comments: [
        { author: 'dona_marta_bg', text: '¡Qué bendición tener esta paca tan práctica para la casa! Ya hice mi pedido 👌', time: '1 h' },
        { author: 'carlos_sahagun', text: 'Llegó bien fría y súper puntual. Excelente atención del muchacho de la moto 👏', time: '45 m' },
        { author: 'tienda_el_oasis', text: 'Vecinos, tráiganme 5 pacas hoy mismo por favor 🙌', time: '20 m' }
      ]
    },
    {
      id: 2,
      image: 'assets/bolsa-250ml.jpg',
      tag: '📦 Más Vendido',
      likes: 589,
      isLiked: false,
      date: 'Hace 1 día',
      caption: `📦 ¡CALIDAD Y RENDIMIENTO PARA TU NEGOCIO O HOGAR! 💧\n\nNuestra tradicional Paca de agua de 250 ml es la preferida por tiendas de barrio, eventos y familias en Bajo Grande.\n\n✔️ Agua 100% microfiltrada y tratada con registro INVIMA.\n✔️ Bolsitas resistentes, prácticas para llevar en la lonchera o el trabajo.\n💰 Paca completa a solo $4.000.\n\n📲 Pide tu paca al 305 413 6677. Reparto rápido y seguro.\n\n#AguaMagaly #PacasDeAgua #SahagunCordoba #BajoGrande #AguaPotable #Bolsitas250ml #TiendasDeBarrio`,
      comments: [
        { author: 'estanco_central_sahagun', text: 'Las más vendidas en la tienda, rinden muchísimo y el sabor es 100% limpio sin sabor a cloro ni nada.', time: '1 d' },
        { author: 'profe_lina', text: 'Las que siempre compramos para el colegio de los niños en los descansos. Muy recomendadas ❤️', time: '18 h' },
        { author: 'jorge_luis_bg', text: 'La mejor agua de toda la región, 100% recomendada!', time: '12 h' }
      ]
    },
    {
      id: 3,
      image: 'assets/post-planta.jpg',
      tag: '🔬 Calidad INVIMA',
      likes: 673,
      isLiked: false,
      date: 'Hace 3 días',
      caption: `🔬 DETRÁS DE CADA GOTA: NUESTRA PLANTA DE TRATAMIENTO Y PURIFICACIÓN 💧\n\nEn Agua Magaly nos tomamos la salud de nuestra comunidad con la máxima seriedad. Contamos con sistema avanzado de filtración por Ósmosis Inversa, filtración de carbón activado, desinfección ultravioleta y tanques de acero inoxidable grado alimenticio.\n\n✅ Certificación sanitaria INVIMA.\n✅ Cero impurezas, minerales equilibrados y frescura inigualable.\n\n¡Orgullo de Bajo Grande para todo Sahagún! 💙\n\n#PlantaPurificadora #OsmosisInversa #AguaSegura #ControlDeCalidad #SaludYBienestar #Sahagun #BajoGrande`,
      comments: [
        { author: 'ing_quimico_cordoba', text: 'Impecable la infraestructura y los protocolos de inocuidad. Felicitaciones al equipo de Agua Magaly 👏', time: '3 d' },
        { author: 'alcaldia_sahagun', text: 'Apoyando el desarrollo local y las empresas comprometidas con la salud pública de nuestras comunidades.', time: '2 d' },
        { author: 'mario_g_99', text: 'Increíble ver una planta tan moderna en nuestro pueblo!', time: '2 d' }
      ]
    },
    {
      id: 4,
      image: 'assets/post-reparto.jpg',
      tag: '🛵 Domicilios',
      likes: 521,
      isLiked: false,
      date: 'Hace 5 días',
      caption: `🛵 ¡LLÉVATE EL AGUA A TU PUERTA SIN COSTO EXTRA DE SALIDA! ☀️\n\n¿Hace calor en Sahagún? Nuestro equipo de entregas ya está recorriendo las calles de Bajo Grande y sectores aledaños para que nunca te falte agua fresca en casa.\n\n⏰ Horario continuo: Lunes a Domingo de 7:00 AM a 6:00 PM.\n📲 Solo envía un WhatsApp al 305 413 6677 y estamos en tu puerta en minutos.\n\n#DomiciliosSahagun #BajoGrande #ServicioAlCliente #AguaADomicilio #PidePorWhatsApp #SahagunPuebloHermoso`,
      comments: [
        { author: 'pedro_martinez_bg', text: 'El domiciliario siempre con buena energía y puntualito. 10 de 10!', time: '5 d' },
        { author: 'panaderia_la_union', text: 'Gracias por traernos el pedido tan temprano hoy, nos salvaron la producción.', time: '4 d' }
      ]
    },
    {
      id: 5,
      image: 'assets/post-familia.jpg',
      tag: '🍲 Familia',
      likes: 734,
      isLiked: false,
      date: 'Hace 1 semana',
      caption: `🍲 EL MEJOR COMPAÑERO DE TU MESA Y DE TUS TRADICIONES 🏡\n\nNo hay nada como compartir un buen sancocho sabanero en familia con la total tranquilidad de estar tomando agua verdaderamente pura, segura y refrescante.\n\nAgua Magaly cuida la salud y el bienestar de los que más quieres en cada comida del día. 💙\n\n#FamiliaMagaly #AlmuerzoEnFamilia #TradicionCordobesa #ComidaCostena #AguaSaludable #BajoGrande #Sahagun`,
      comments: [
        { author: 'laura_sofia_21', text: 'Hermosa foto, así es todos los domingos en la casa de mis abuelos con el sancocho bien caliente y agua helada ❤️', time: '6 d' },
        { author: 'andres_gourmet', text: 'La pureza del agua se nota hasta en el sabor del caldo. Calidad de exportación 👌', time: '5 d' },
        { author: 'beatriz_sahagun', text: 'Hermosa familia y hermoso mensaje bendiciones!', time: '4 d' }
      ]
    },
    {
      id: 6,
      image: 'assets/post-fresca.jpg',
      tag: '🧊 Hidratación',
      likes: 608,
      isLiked: false,
      date: 'Hace 1 semana',
      caption: `🧊 ¿CALOR DEL MEDIODÍA? HIDRÁTATE CON LO MEJOR ☀️🌴\n\nEn nuestra hermosa tierra sabanera el sol pega fuerte, pero un vaso de Agua Magaly bien fría te devuelve la vida y la energía al instante.\n\nRecuerda tomar al menos 2 litros de agua al día para mantener tu cuerpo hidratado y saludable.\n\n👉 ¿Ya pediste la tuya hoy? Escríbenos directamente al 305 413 6677.\n\n#HidratacionTotal #AguaFria #SahagunCalor #VidaSana #AguaMagaly #BajoGrande #Refrescante`,
      comments: [
        { author: 'fitness_sahagun', text: 'Indispensable para después de entrenar en las mañanas 🔥', time: '1 sem' },
        { author: 'mariana_v', text: 'Se ve demasiado provocativa con ese limoncito y hielos 😍🤤', time: '1 sem' }
      ]
    }
  ];

  let currentPostIndex = null;
  let followerCount = 3842;
  let isFollowing = false;

  // Inicialización cuando carga el DOM
  document.addEventListener('DOMContentLoaded', () => {
    initFollowButton();
    renderPhotoGrid();
    initModal();
    initContactModal();
    initStoryViewer();
  });

  // Botón Seguir / Siguiendo
  function initFollowButton() {
    const btn = document.getElementById('btn-follow');
    const followersEl = document.getElementById('followers-count');
    if (!btn || !followersEl) return;

    btn.addEventListener('click', () => {
      isFollowing = !isFollowing;
      if (isFollowing) {
        followerCount++;
        btn.textContent = 'Siguiendo';
        btn.classList.remove('ig-btn-primary');
        btn.classList.add('ig-btn-secondary');
      } else {
        followerCount--;
        btn.textContent = 'Seguir';
        btn.classList.remove('ig-btn-secondary');
        btn.classList.add('ig-btn-primary');
      }
      followersEl.textContent = followerCount.toLocaleString('es-CO');
    });
  }

  // Renderizar las publicaciones en la cuadrícula
  function renderPhotoGrid() {
    const grid = document.getElementById('ig-photo-grid');
    if (!grid) return;

    grid.innerHTML = '';
    POSTS_DATA.forEach((post, index) => {
      const card = document.createElement('div');
      card.className = 'ig-post-card';
      card.innerHTML = `
        <img src="${post.image}" alt="Publicación Agua Magaly ${index + 1}" loading="lazy">
        <span class="ig-post-tag">${post.tag}</span>
        <div class="ig-post-overlay">
          <div class="ig-overlay-stat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span class="card-likes-val">${post.likes}</span>
          </div>
          <div class="ig-overlay-stat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
            <span>${post.comments.length}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openPostModal(index));
      grid.appendChild(card);
    });
  }

  // Control del modal de publicación
  function initModal() {
    const backdrop = document.getElementById('ig-modal-backdrop');
    const closeBtn = document.getElementById('ig-modal-close');
    const likeBtn = document.getElementById('modal-like-btn');
    const commentInput = document.getElementById('modal-comment-input');
    const postCommentBtn = document.getElementById('modal-post-comment-btn');

    if (!backdrop) return;

    closeBtn.addEventListener('click', closePostModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePostModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePostModal();
        closeContactModal();
      }
    });

    // Dar Like
    likeBtn.addEventListener('click', () => {
      if (currentPostIndex === null) return;
      const post = POSTS_DATA[currentPostIndex];
      post.isLiked = !post.isLiked;
      post.likes += post.isLiked ? 1 : -1;
      updateLikeUI(post);
      renderPhotoGrid(); // Actualiza el contador en la grilla
    });

    // Enviar comentario
    function submitComment() {
      const text = commentInput.value.trim();
      if (!text || currentPostIndex === null) return;

      const post = POSTS_DATA[currentPostIndex];
      post.comments.push({
        author: 'usuario_sahagun',
        text: text,
        time: 'Justo ahora'
      });

      commentInput.value = '';
      postCommentBtn.classList.remove('active');
      renderComments(post);
      renderPhotoGrid();
      
      // Auto-scroll al final de comentarios
      const scrollEl = document.getElementById('modal-comments-scroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }

    postCommentBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitComment();
      }
    });

    commentInput.addEventListener('input', () => {
      if (commentInput.value.trim().length > 0) {
        postCommentBtn.classList.add('active');
      } else {
        postCommentBtn.classList.remove('active');
      }
    });
  }

  function openPostModal(index) {
    currentPostIndex = index;
    const post = POSTS_DATA[index];
    const backdrop = document.getElementById('ig-modal-backdrop');
    const img = document.getElementById('modal-post-img');
    const captionEl = document.getElementById('modal-caption-text');
    const dateEl = document.getElementById('modal-post-date');
    const waOrderBtn = document.getElementById('modal-wa-order');

    img.src = post.image;
    captionEl.innerHTML = formatCaption(post.caption);
    dateEl.textContent = post.date;

    // Configurar botón de pedido para esta foto
    if (waOrderBtn) {
      const msg = encodeURIComponent(`¡Hola Agua Magaly! Vi su publicación en Instagram (${post.tag}) y deseo hacer un pedido. ¿Tienen disponibilidad inmediata en Bajo Grande / Sahagún?`);
      waOrderBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
    }

    updateLikeUI(post);
    renderComments(post);

    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePostModal() {
    const backdrop = document.getElementById('ig-modal-backdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    currentPostIndex = null;
  }

  function updateLikeUI(post) {
    const likeBtn = document.getElementById('modal-like-btn');
    const likesCount = document.getElementById('modal-likes-count');
    if (!likeBtn || !likesCount) return;

    if (post.isLiked) {
      likeBtn.classList.add('liked');
      likeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#ed4956"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    } else {
      likeBtn.classList.remove('liked');
      likeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    }

    likesCount.textContent = `${post.likes.toLocaleString('es-CO')} Me gusta`;
  }

  function renderComments(post) {
    const scrollEl = document.getElementById('modal-comments-scroll');
    if (!scrollEl) return;

    // Mantener la fila de caption inicial
    const authorRow = `
      <div class="ig-comment-row">
        <img src="assets/logo-magaly.png" alt="Agua Magaly" class="ig-comment-avatar" style="object-fit: contain; padding: 2px;">
        <div class="ig-comment-content">
          <span class="ig-comment-author">aguamagaly_oficial</span>
          <span class="ig-comment-text">${formatCaption(post.caption)}</span>
          <div class="ig-comment-meta">
            <span>${post.date}</span>
          </div>
        </div>
      </div>
    `;

    const commentsRows = post.comments.map(c => `
      <div class="ig-comment-row">
        <div class="ig-comment-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#475569;background:#e2e8f0;">
          ${c.author.substring(0, 2).toUpperCase()}
        </div>
        <div class="ig-comment-content">
          <span class="ig-comment-author">${c.author}</span>
          <span class="ig-comment-text">${escapeHtml(c.text)}</span>
          <div class="ig-comment-meta">
            <span>${c.time}</span>
            <span style="font-weight:600;cursor:pointer;">Responder</span>
          </div>
        </div>
        <button class="ig-comment-like-btn" aria-label="Me gusta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
    `).join('');

    scrollEl.innerHTML = authorRow + commentsRows;
  }

  function formatCaption(text) {
    let escaped = escapeHtml(text).replace(/\n/g, '<br>');
    // Resaltar hashtags
    escaped = escaped.replace(/(#[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)/g, '<span style="color:#00376b;font-weight:500;">$1</span>');
    return escaped;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Modal de contacto
  function initContactModal() {
    const contactBtn = document.getElementById('btn-contact');
    const contactModal = document.getElementById('ig-contact-modal');
    const closeBtn = document.getElementById('btn-close-contact');

    if (!contactBtn || !contactModal) return;

    contactBtn.addEventListener('click', () => {
      contactModal.classList.add('open');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeContactModal);
    }

    contactModal.addEventListener('click', (e) => {
      if (e.target === contactModal) closeContactModal();
    });
  }

  function closeContactModal() {
    const contactModal = document.getElementById('ig-contact-modal');
    if (contactModal) contactModal.classList.remove('open');
  }

  // Interacción en historias destacadas
  function initStoryViewer() {
    const items = document.querySelectorAll('.ig-highlight-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const title = item.getAttribute('data-story-title') || 'Historia Destacada';
        // Abrir la primera foto relacionada
        const relatedId = item.getAttribute('data-post-index');
        if (relatedId !== null && relatedId !== undefined) {
          openPostModal(parseInt(relatedId, 10));
        }
      });
    });
  }

})();
