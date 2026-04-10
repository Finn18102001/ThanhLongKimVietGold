mobileMenu('.header-hamburger');
// flashsale countdown
demnguoc(80000, '#flashsale-hours', '#flashsale-mins', '#flashsale-sec');

// banner
var bannerHome = new Swiper('.banner-slider', {
  slidesPerView: 1,
  spaceBetween: 20,
  speed: 1000,
  loop: true,
  preloadImages: false,
  observer: true,
  observeParents: true,
  allowTouchMove: false,
  lazy: {
    loadPrevNext: true,
  },
  autoplay: {
    delay: 5000,
  },
  // zoom: true,
  watchOverflow: true,
  pagination: {
    el: '.banner-slider .swiper-pagination',
    clickable: true,
  },
  navigation: {
    nextEl: '.banner-slider .custom-button-next',
    prevEl: '.banner-slider .custom-button-prev',
  },
});

// san pham noi bat
var bannernoibat = new Swiper('.sanpham-noibat .sanpham-slide', {
  slidesPerView: 2,
  spaceBetween: 15,
  speed: 1000,
  loop: false,
  observer: true,
  observeParents: true,
  preloadImages: false,
  lazy: { loadPrevNext: true },
  pagination: {
    el: '.sanpham-noibat .swiper-pagination',
    clickable: true,
  },
  navigation: {
    nextEl: '.sanpham-noibat .custom-button-next',
    prevEl: '.sanpham-noibat .custom-button-prev',
  },
  breakpoints: {
    576: {
      slidesPerView: 3,
      spaceBetween: 15,
    },
    992: {
      slidesPerView: 4,
      spaceBetween: 20,
    },
    1200: {
      slidesPerView: 4,
      spaceBetween: 29,
    },
  },
});
// san pham slider2
// var bannernolink = new Swiper('.sanpham-banner-nolink .sanpham-slide', {
//   slidesPerView: 2,
//   spaceBetween: 15,
//   speed: 1000,
//   loop: false,
//   preloadImages: false,
//   observer: true,
//   observeParents: true,
//   lazy: {
//     loadPrevNext: true,
//   },
//   pagination: {
//     el: '.sanpham-banner-nolink  .swiper-pagination',
//     clickable : true,
//   },
//   navigation: {
//     nextEl: '.sanpham-banner-nolink .custom-button-next',
//     prevEl: '.sanpham-banner-nolink .custom-button-prev',
//   },
//   breakpoints: {
//     576: {
//       slidesPerView: 3,
//       spaceBetween: 15,
//     },
//     992: {
//       slidesPerView: 4,
//       spaceBetween: 20,
//     },
//     1200: {
//       slidesPerView: 4,
//       spaceBetween: 29,
//     },
//   },
// });
$('.sanpham-banner-nolink .sanpham-slide').each(function() {
  var bannernolink = new Swiper(this, {
    slidesPerView: 2,
    spaceBetween: 15,
    speed: 1000,
    loop: false,
    preloadImages: false,
    observer: true,
    observeParents: true,
    lazy: {
      loadPrevNext: true,
    },
    breakpoints: {
      576: {
        slidesPerView: 3,
        spaceBetween: 15,
      },
      992: {
        slidesPerView: 4,
        spaceBetween: 20,
      },
      1200: {
        slidesPerView: 4,
        spaceBetween: 29,
      },
    },
  });
  $(this)
    .parents('.sanpham-banner-nolink')
    .find('.custom-button-prev')
    .on('click', function(e) {
      e.preventDefault();
      bannernolink.slidePrev();
    });
  $(this)
    .parents('.sanpham-banner-nolink')
    .find('.custom-button-next')
    .on('click', function(e) {
      e.preventDefault();
      bannernolink.slideNext();
    });
});
// san pham slider3
// var bannerwlink = new Swiper('.sanpham-banner-w-link .sanpham-slide', {
//   slidesPerView: 2,
//   spaceBetween: 15,
//   speed: 1000,
//   loop: false,
//   preloadImages: false,
//   observer: true,
//   observeParents: true,
//   lazy: {
//     loadPrevNext: true,
//   },
//   pagination: {
//     el: '.sanpham-banner-w-link .swiper-pagination',
//     clickable : true,
//   },
//   navigation: {
//     nextEl: '.sanpham-banner-w-link .custom-button-next',
//     prevEl: '.sanpham-banner-w-link .custom-button-prev',
//   },
//   breakpoints: {
//     576: {
//       slidesPerView: 3,
//       spaceBetween: 15,
//     },
//     992: {
//       slidesPerView: 4,
//       spaceBetween: 20,
//     },
//     1200: {
//       slidesPerView: 4,
//       spaceBetween: 29,
//     },
//   },
// });
$('.sanpham-banner-w-link .sanpham-slide').each(function() {
  var mySwiper = new Swiper(this, {
    slidesPerView: 2,
    spaceBetween: 15,
    speed: 1000,
    loop: false,
    preloadImages: false,
    observer: true,
    observeParents: true,
    lazy: {
      loadPrevNext: true,
    },
    breakpoints: {
      576: {
        slidesPerView: 3,
        spaceBetween: 15,
      },
      992: {
        slidesPerView: 4,
        spaceBetween: 20,
      },
      1200: {
        slidesPerView: 4,
        spaceBetween: 29,
      },
    },
  });
  $(this)
    .parents('.sanpham-banner-w-link')
    .find('.custom-button-prev')
    .on('click', function(e) {
      e.preventDefault();
      mySwiper.slidePrev();
    });
  $(this)
    .parents('.sanpham-banner-w-link')
    .find('.custom-button-next')
    .on('click', function(e) {
      e.preventDefault();
      mySwiper.slideNext();
    });
});
$('.cate-slide').each(function() {
  var mySwiper = new Swiper(this, {
    slidesPerView: 2,
    spaceBetween: 15,
    speed: 1000,
    loop: false,
    preloadImages: false,
    observer: true,
    observeParents: true,
    lazy: {
      loadPrevNext: true,
    },
    breakpoints: {
      576: {
        slidesPerView: 3,
        spaceBetween: 15,
      },
      992: {
        slidesPerView: 4,
        spaceBetween: 20,
      },
      1200: {
        slidesPerView: 6,
        spaceBetween: 29,
      },
    },
  });
  $(this)
    .parents('.sanpham-banner-w-link')
    .find('.custom-button-prev')
    .on('click', function(e) {
      e.preventDefault();
      mySwiper.slidePrev();
    });
  $(this)
    .parents('.sanpham-banner-w-link')
    .find('.custom-button-next')
    .on('click', function(e) {
      e.preventDefault();
      mySwiper.slideNext();
    });
});
// cua hang
var bannercuahang = new Swiper('.cuahang-slider .cuahang-slide', {
  slidesPerView: 1,
  spaceBetween: 1,
  speed: 1000,
  centeredSlides: true,
  roundLengths: true,
  loop: true,
  observer: true,
  observeParents: true,
  preloadImages: false,
  lazy: {
    loadPrevNext: true,
  },
  pagination: {
    el: '.cuahang-slider .swiper-pagination',
    clickable: true,
  },
  navigation: {
    nextEl: '.cuahang-slider .custom-button-next',
    prevEl: '.cuahang-slider .custom-button-prev',
  },
  breakpoints: {
    768: {
      slidesPerView: 2,
      spaceBetween: 1,
    },
    1024: {
      slidesPerView: 3,
      spaceBetween: 1,
    },
  },
});

AOS.init({
  // startEvent: 'load',
  duration: 700,
  easing: 'ease',
});

//check box height
var height = $('.container-l .chart-body').outerHeight();
if ($(window).width() > 992) {
  // $('.container-r .chart-body').css('height', height + 'px');
}
// chart js

// var json = {
//   labels: [
//     '2022-08-20 10:23:00',
//     '2022-08-20 10:28:00',
//     '2022-08-20 11:33:00',
//     '2022-08-20 12:38:00',
//     '2022-08-20 13:43:00',
//     '2022-08-20 14:48:00',
//     '2022-08-20 15:53:00',
//     '2022-08-20 16:58:00',
//     '2022-08-20 17:03:00',
//     '2022-08-20 18:08:00',
//   ],
//   data: {
//     rate: [50, 50.022, 51.225, 53.1, 54, 54.6, 55.22, 57.5, 58.8, 61],
//     sell: [60, 61.022, 62.225, 63.1, 64, 64.6, 66.22, 67.6, 68.8, 69],
//   },
// };

var json;

async function getGoldrateByTime(type, time_type = 'hour',init = false) {
  let url = '/api/v1/exchangerate/goldRateChart?gold_type=' + type + '&time_type=' + time_type + '&init=' + init;
  let obj = await (await fetch(url)).json();


  //console.log(obj);
  return obj;
}

async function getGolRateByType(type = 'KGB', time_type = 'month',init = false) {
  json = await getGoldrateByTime(type, time_type,init);

  var xAsisOptions = {
    stepSize: 3,
    min: 0,
    max: 0,
    unit: 'hour',
    displayFormats: { hour: 'H:mm' },

  };

  if (time_type === 'day') {
    xAsisOptions = {
      stepSize: 9,
      min: 0,
      max: 0,
      unit: 'hour',
      displayFormats: { hour: 'H:mm' },
    };
  } else if (time_type == 'week') {
    xAsisOptions = {
      stepSize: 1,
      min: 0,
      max: 0,
      unit: 'day',
      displayFormats: { day: 'd/M' },
    };
  } else if (time_type == 'month') {
    xAsisOptions = {
      stepSize: 1,
      min: 0,
      max: 0,
      unit: 'day',
      displayFormats: { day: 'd/M' },
    };
  } else if (time_type == 'year') {
    xAsisOptions = {
      stepSize: 1,
      min: 0,
      max: 0,
      unit: 'month',
    };
  }

  initChart(json, xAsisOptions);
}


// getGolRateByType($('#select-box-gold-type').val());

var myChart = null;

//homepage chart
function initChart(data, xAsisOptions) {
  let min = new Date(data.labels[0]);

  let max = new Date(data.labels[data.labels.length - 1]);
  let newOptions = {
    ...xAsisOptions,
    time: {
      min: min,
      max: max,
    },
  };

  let config = {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Bán',
          data: data.data.sell,
          backgroundColor: 'transparent',
          borderColor: 'rgb(33 150 83)',
          lineTension: 0,
          pointRadius: data.labels.length === 1 ? 4 : 0,
          pointHitRadius: 4,
          pointBackgroundColor: 'rgb(33 150 83)',
        },
        {
          label: 'Mua',
          data: data.data.rate,
          backgroundColor: 'transparent',
          borderColor: 'rgb(170 31 35)',
          lineTension: 0,
          pointRadius: data.labels.length === 1 ? 4 : 0,
          borderWidth: 1,
          pointHitRadius: 4,
          pointBackgroundColor: 'rgb(170 31 35)',
        },
      ],
    },

    options: {
      legend: {
        display: false,
      },
      animation: false,
      scales: {
        y: {
          position: 'right',
          grid: {
            borderWidth: 0,
          },
          ticks: {
            color: '#BABABA',
            font: {
              size: 14,
              family: 'SVN-Megante',
            },
            // callback:function(value) {
            //     let minValue = json.data.rate[9];
            //     let maxValue = json.data.sell[9];
            //     return value;
            // }
          },
        },
        x: {
          grid: {
            display: false,
          },
          offset: false,
          type: 'time',
          beginAtZero: 'false',
          time: newOptions,
          ticks: {
            color: 'black',
            font: {
              size: 14,
              family: 'SVN-Megante',
            },
          },
        },
      },
    },
  };

  if (myChart === null) {
  } else {
    myChart.destroy();
  }
  if (document.getElementById('myChart')) {
    myChart = new Chart(document.getElementById('myChart'), config);
  }
}

function updateChart(chartType) {
  console.log(chartType);
  let data, xAsisOptions;
  initChart(data, xAsisOptions);
}

function login_function() {
  var x = document.getElementById('modalResigter');
  if (x.style.display === 'none') {
    // x.style.display = "block";
    $('.function_login').addClass('active');
  } else {
    // x.style.display = "none";
    $('.function_login').removeClass('active');
  }
}

function login_form() {
  $('.register_form').addClass('d-none');
  $('.login_form').removeClass('d-none');
  $('#text_login_reg').text('Đăng nhập');
}

function register_form() {
  $('.register_form').removeClass('d-none');
  $('.login_form').addClass('d-none');
  $('#text_login_reg').text('Đăng ký');
}

function submit_register_form() {
  $.ajax({
    url: '/auth/register',
    type: 'POST',
    data: $('#modalResigter #register_form').serialize(),
    dataType: 'json',
    beforeSend: function() {},
    success: function(data) {
      window.location.reload('/');
    },
    error: function(data) {
      $.each(data.responseJSON.errors, function(key, value) {
        $('#error_' + key).html(value[0]);
      });
    },
  });
}

// function submit_login_form() {
//   $.ajax({
//     url: "/auth/check_information",
//     type: 'POST',
//     data: $("#login_form").serialize(),
//     dataType: 'json',
//     beforeSend: function () {
//     },
//     success: function (data) {
//       window.location.reload('/')
//     },
//     error: function (data) {
//       let err_msg = $("#error_msg");
//       let err_login_pass = $("#error_login_password");
//       let err_login_email = $("#error_login_email");
//       let error = data.responseJSON.data;

//       err_msg.empty();
//       err_login_pass.empty();
//       err_login_email.empty();

//       if (typeof error != 'undefined'){
//         if (typeof error.password != 'undefined'){
//           err_login_pass.html(error.password[0]);
//         }
//         if (typeof error.username != 'undefined'){
//           err_login_email.html(error.username[0]);
//         }
//       }else {
//           err_msg.html(data.responseJSON.msg);
//       }

//     },
//   })

// }

$(window).bind('load', function() {
  // chart radio
  $('.chart-radio').on('change', function() {
    let chartType = $(this).val();

    getGolRateByType($('#select-box-gold-type').val(), chartType);
  });
  $('#header__overlay').on('click', function() {
    console.log('dmmm');
    $('#modalResigter').removeClass('active');
    $('#header__overlay').removeClass('active');
  });
  $('#select-box-gold-type').on('change', function() {
    let chartType = $('input[name="customRadioInline1"]:checked').val();

    getGolRateByType($('#select-box-gold-type').val(), chartType);
  });

  $('.form-control').on('change', function() {
    $('#error_' + $(this).attr('id')).html('');
  });

  $('#digit-0').focus();

  $('.digit-init').on('keyup', function() {
    let next = $(this).attr('data-next');
    $('#' + next).focus();
  });

  $('#reload').on('click', function() {
    $('#reload_form').submit();
  });

  $('#update_customer').on('click', function() {
    $('#update_customer_form').submit();
  });

  $('#change_pass').on('click', function() {
    $('#change_pass_form').submit();
  });

  $('#check_otp_reset').on('click', function() {
    $.ajax({
      url: '/auth/check_otp_reset_password',
      type: 'POST',
      data: $('#check_otp_reset_form').serialize(),
      dataType: 'json',
      beforeSend: function() {},
      success: function(data) {
        if (data.data.success) {
          $.ajax({
            url: '/auth/send_reset_password',
            type: 'POST',
            data: { email: data.data.data.email },
            dataType: 'json',
            beforeSend: function() {},
          });
          location.replace('/auth/check/otp?email=' + data.data.data.email);
        } else {
          $('#error_massage').html(data.message);
        }
      },
    });
  });

  $('#city_dropdown').on('change', function() {
    $('#district_dropdown').attr('disabled', 'disabled');
    if ($(this).val() !== 'uncity') {
      $.ajax({
        url: '/get_district_by_province/' + $(this).val(),
        type: 'GET',
        dataType: 'json',
        beforeSend: function() {},
        success: function(data) {
          let html = '<option value="">-- Chọn Quận/ Huyện</option>';
          let style = ['Quận', 'Huyện', 'Thành Phố', 'Thị Xã/Ấp'];
          $.each(data.data.data.data, function(key, value) {
            html += '<option value="' + value.id + '">' + style[value.type] + ' ' + value.name + '</option>';
          });
          $('#district_dropdown').html(html);
          $('#district_dropdown').removeAttr('disabled');
          $('#ward_dropdown').html('<option value="">-- Chọn Xã/ Phường</option>');
          $('#ward_dropdown').attr('disabled');
        },
      });
    }
  });

  $('#district_dropdown').on('change', function() {
    $.ajax({
      url: '/get_ward_by_district/' + $(this).val(),
      type: 'GET',
      dataType: 'json',
      beforeSend: function() {},
      success: function(data) {
        let html = '<option value="">-- Chọn Xã/ Phường</option>';
        let style = ['Phường', 'Xã', 'Thị trấn', 'Ấp'];
        $.each(data.data.data.data, function(key, value) {
          html += '<option value="' + value.id + '">' + style[value.type] + ' ' + value.name + '</option>';
        });
        $('#ward_dropdown').html(html);
        $('#ward_dropdown').removeAttr('disabled');
      },
    });
  });

  $('#check_order').on('click', function() {
    alert($('#check_order_phone'.val()));
  });
});
$(document).ready(function(){
    if($('#select-box-gold-type').length > 0 && $('#select-box-gold-type').val() ) {
      getGolRateByType($('#select-box-gold-type').val());
    }
  })
//Fix gold rate
function renderGoldRateComponent(idElement){


  // if(!$(idElement).length) return;

  // let wrapper =$(idElement);
  // $.ajax(
  //   {
  //       url:'/gold-rate-render',
  //       type: 'GET',
  //       success:function(response){
  //         wrapper.html(response);
  //         getGolRateByType($('#select-box-gold-type').val(),'month',true);
  //       },
  //       complete:function(){

  //       },
  //       error:function(data){
  //       }
  //   });
}
