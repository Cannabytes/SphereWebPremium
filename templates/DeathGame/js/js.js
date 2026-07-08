$(document).ready(function(){
	$('ul.tabs li').click(function(e){
		$('ul.tabs li').removeClass('active');
		$(this).addClass('active');

		var link = $(this).find('a').attr('href');
		$('.side_about .about_item').removeClass('active');
		$(link).addClass('active');
		e.preventDefault();
	});
});

function show() {
	$('#popup').show().animate({opacity: '1'}, 300);
	$('.popup_content').animate({top: '20%'}, 300);
	$('body').css({overflow: 'hidden'});
}

function hide() {
	$('#popup').animate({opacity: '0'}, 300).hide(50);
	$('.popup_content').animate({top: '-20%'}, 300);
	$('body').css({overflow: 'auto'});
}

$(document).ready(function(){
	$('body').append('<div class="loaded"></div>');
});

$(window).load(function(){
    setTimeout(function(){
        $('.loaded').animate({opacity: '0'}, 200).hide(50);
        $('body').css({overflow: 'auto'});
    }, 2000);
});