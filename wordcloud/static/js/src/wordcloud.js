
var d3Cloud = d3.layout.cloud

/* TODO add real i18n support */
function gettext(text) { return text }

/* TODO add real HTML escaping */
function escapeHtml(s) { return s } 

/* Hacky way to replace HtmlUtils.interpolateString */
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

/* Hacky way to replace HtmlUtils.interpolateHtml */
String.prototype.formatHtml = function() {
  escapeHtml(this.format(arguments))
}


/* Javascript for WordCloudXBlock. */
function WordCloudXBlock(runtime, element) {

  this.init = function() {
    this.wordCloudEl = $(element).find('.word_cloud');
    this.width = 635;
    this.height = 635;
    var state = JSON.parse($('#wordcloud-state')[0].innerHTML);
    if (state.submitted) {
        this.showWordCloud(state)
    }
    $(element).find('.save').on('click', () => {
      this.submitAnswer();
    });
  }


  /**
  * @function submitAnswer
  *
  * Callback to be executed when the user enters their words. It will send user entries to the
  * server, and upon receiving correct response, will call the function to generate the
  * word cloud.
  */
  this.submitAnswer = function() {
    var student_words = []

    // Populate the data to be sent to the server with user's words.
    this.wordCloudEl.find('input.input-cloud').each((index, value) => {
      student_words.push($(value).val())
    });

    console.log(student_words)

    // Send the data to the server as an AJAX request. Attach a callback that will
    // be fired on server's response.
    $.post({
        url: runtime.handlerUrl(element, 'submit'),
        data: JSON.stringify({ student_words: student_words })
    }).done(
      (response) => {
        if (response.status !== 'success') {
          return;
        }
        this.showWordCloud(response)
      },
    );
  }

  /**
  * @function showWordCloud
  *
  * @param {object} response The response from the server that contains the user's entered words
  * along with all of the top words.
  *
  * This function will set up everything for d3 and launch the draw method. Among other things,
  * iw will determine maximum word size.
  */
  this.showWordCloud = function(response) {
    const words = response.top_words;
    let maxSize = 0;
    let minSize = 10000;
    let scaleFactor = 1;
    let maxFontSize = 200;
    const minFontSize = 16;

    this.wordCloudEl.find('.input_cloud_section').hide();

    // Find the word with the maximum percentage. I.e. the most popular word.
    $.each(words, (index, word) => {
      if (word.size > maxSize) {
        maxSize = word.size;
      }
      if (word.size < minSize) {
        minSize = word.size;
      }
    });

    // Find the longest word, and calculate the scale appropriately. This is
    // required so that even long words fit into the drawing area.
    //
    // This is a fix for: if the word is very long and/or big, it is discarded by
    // for unknown reason.
    $.each(words, (index, word) => {
      let tempScaleFactor = 1.0;
      const size = ((word.size / maxSize) * maxFontSize);

      if (size * 0.7 * word.text.length > this.width) {
        tempScaleFactor = ((this.width / word.text.length) / 0.7) / size;
      }

      if (scaleFactor > tempScaleFactor) {
        scaleFactor = tempScaleFactor;
      }
    });

    // Update the maximum font size based on the longest word.
    maxFontSize *= scaleFactor;

    // Generate the word cloud.
    d3Cloud().size([this.width, this.height])
    .words(words)
    .rotate(() => Math.floor((Math.random() * 2)) * 90)
    .font('Impact')
    .fontSize((d) => {
      let size = (d.size / maxSize) * maxFontSize;

      size = size >= minFontSize ? size : minFontSize;

      return size;
    })
    // Draw the word cloud.
    .on('end', (wds, bounds) => this.drawWordCloud(response, wds, bounds))
    .start();
  }

  /**
  * @function drawWordCloud
  *
  * This function will be called when d3 has finished initing the state for our word cloud,
  * and it is ready to hand off the process to the drawing routine. Basically set up everything
  * necessary for the actual drwing of the words.
  *
  * @param {object} response The response from the server that contains the user's entered words
  * along with all of the top words.
  *
  * @param {array} words An array of objects. Each object must have two properties. One property
  * is 'text' (the actual word), and the other property is 'size' which represents the number that the
  * word was enetered by the students.
  *
  * @param {array} bounds An array of two objects. First object is the top-left coordinates of the bounding
  * box where all of the words fir, second object is the bottom-right coordinates of the bounding box. Each
  * coordinate object contains two properties: 'x', and 'y'.
  */
  this.drawWordCloud = function(response, words, bounds) {
    // Color words in different colors.
    const fill = d3.scale.category20();

    // Will be populated by words the user enetered.
    const studentWordsKeys = [];

    // By default we do not scale.
    let scale = 1;

    // Caсhing of DOM element
    const cloudSectionEl = this.wordCloudEl.find('.result_cloud_section');

    // Iterator for word cloud count for uniqueness
    let wcCount = 0;

    // If bounding rectangle is given, scale based on the bounding box of all the words.
    if (bounds) {
      scale = 0.5 * Math.min(
        this.width / Math.abs(bounds[1].x - (this.width / 2)),
        this.width / Math.abs(bounds[0].x - (this.width / 2)),
        this.height / Math.abs(bounds[1].y - (this.height / 2)),
        this.height / Math.abs(bounds[0].y - (this.height / 2)),
      );
    }

    $.each(response.student_words, (word, stat) => {
      const percent = (response.display_student_percents) ? ` ${Math.round(100 * (stat / response.total_count))}%` : '';

      studentWordsKeys.push(
        '{0}{1}{2}{3}{4}{5}'.formatHtml(
          '<li>', '<strong>', word, '<strong>', percent, '</li>'
        )
      )
    });

    // Comma separated string of user enetered words.
    const studentWordsStr = studentWordsKeys.join('');

    cloudSectionEl
    .addClass('active');

    cloudSectionEl.find('.your_words').html(escapeHtml(studentWordsStr))

    cloudSectionEl.find('.your_words').end().find('.total_num_words').html(
      '{0}{1}{2} words submitted in total.'.format(
        '<strong>', response.total_count, '</strong>'
      )
    )

    $(`${cloudSectionEl.attr('id')} .word_cloud`).empty();

    // Actual drawing of word cloud.
    const groupEl = d3.select(`#${cloudSectionEl.attr('id')} .word_cloud`).append('svg')
    .attr('width', this.width)
    .attr('height', this.height)
    .append('g')
    .attr('transform', `translate(${0.5 * this.width},${0.5 * this.height})`)
    .selectAll('text')
    .data(words)
    .enter()
    .append('g')
    .attr('data-id', () => {
      wcCount += 1;
      return wcCount;
    })
    .attr('aria-describedby', () => gettext('text_word_{0} title_word_{0}').formatHtml(
        generateUniqueId(cloudSectionEl.attr('id'), $(this).data('id')),
    ));

    groupEl
    .append('title')
    .attr('id', () => gettext('title_word_{0}').formatHtml(
      generateUniqueId(cloudSectionEl.attr('id'), $(this).parent().data('id')),
    ))
    .text((d) => {
      let res = '';

      $.each(response.top_words, (index, value) => {
        if (value.text === d.text) {
          res = `${value.percent}%`;
        }
      });

      return res;
    });

    groupEl
    .append('text')
    .attr('id', () => gettext('text_word_{0}').formatHtml(
      generateUniqueId(cloudSectionEl.attr('id'), $(this).parent().data('id')),
    ))
    .style('font-size', d => `${d.size}px`)
    .style('font-family', 'Impact')
    .style('fill', (d, i) => fill(i))
    .attr('text-anchor', 'middle')
    .attr('transform', d => `translate(${d.x}, ${d.y})rotate(${d.rotate})scale(${scale})`)
    .text(d => d.text);
  }


  this.generateUniqueId = function(wordCloudId, counter) {
    return `_wc_${wordCloudId}_${counter}`;
  }

  this.init()
}



