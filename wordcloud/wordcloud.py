"""TO-DO: Write a description of what this XBlock is."""

import pkg_resources
from xblock.core import XBlock
from xblock.fields import Boolean, Dict, Integer, List, Scope, String
from xblock.fragment import Fragment
from xblockutils.resources import ResourceLoader

# Make '_' a no-op so we can scrape strings. Using lambda instead of
#  `django.utils.translation.ugettext_noop` because Django cannot be imported in this file
_ = lambda text: text

loader = ResourceLoader(__name__)


@XBlock.needs('i18n')
class WordCloudXBlock(XBlock):
    """
    TO-DO: document what your XBlock does.
    """
   
    display_name = String(
        display_name=_("Display Name"),
        help=_("The display name for this component."),
        scope=Scope.settings,
        default="Word cloud"
    )
    instructions = String(
        display_name=_("Instructions"),
        help=_("Add instructions to help learners understand how to use the word cloud. Clear instructions are important, especially for learners who have accessibility requirements."),  # nopep8 pylint: disable=C0301
        scope=Scope.settings,
    )
    num_inputs = Integer(
        display_name=_("Inputs"),
        help=_("The number of text boxes available for learners to add words and sentences."),
        scope=Scope.settings,
        default=5,
        values={"min": 1}
    )
    num_top_words = Integer(
        display_name=_("Maximum Words"),
        help=_("The maximum number of words displayed in the generated word cloud."),
        scope=Scope.settings,
        default=250,
        values={"min": 1}
    )
    display_student_percents = Boolean(
        display_name=_("Show Percents"),
        help=_("Statistics are shown for entered words near that word."),
        scope=Scope.settings,
        default=True
    )

    # Fields for descriptor.
    submitted = Boolean(
        help=_("Whether this learner has posted words to the cloud."),
        scope=Scope.user_state,
        default=False
    )
    student_words = List(
        help=_("Student answer."),
        scope=Scope.user_state,
        default=[]
    )
    all_words = Dict(
        help=_("All possible words from all learners."),
        scope=Scope.user_state_summary
    )
    top_words_proportions = Dict(
        help=_("Top num_top_words words for word cloud."),
        scope=Scope.user_state_summary
    )


    TRUTHY_VALUES = [True, "True", "true", "T", "t", "1"]


    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        data = pkg_resources.resource_string(__name__, path)
        return data.decode("utf8")


    def student_view(self, context=None):
        """
        The primary view of the WordCloudXBlock, shown to students
        when viewing courses.
        """
        html = self.resource_string("static/html/wordcloud.html")
        frag = Fragment()
        frag.add_content(
            loader.render_django_template(
                'static/html/wordcloud.html',
                i18n_service=self.i18n_service,
                context={
                    'self': self,
                    'input_range': range(self.num_inputs),
                },
            )
        )
        frag.add_css(self.resource_string("static/css/wordcloud.scss"))
        frag.add_javascript(self.resource_string("static/js/src/wordcloud.js"))
        frag.initialize_js('WordCloudXBlock')
        return frag


    author_view = student_view


    @XBlock.json_handler
    def submit(self, student_words, suffix=''):
        if self.submitted:
            return {
                'status': 'fail',
                'error': 'You have already posted your data.'
            }

        self.student_words = filter(None, map(self.preprocess_word, student_words))

        # FIXME: fix this, when xblock will support mutable types.
        # Now we use this hack.
        # speed issues
        temp_all_words = self.all_words

        self.submitted = True

        # Save in all_words.
        for word in self.student_words:
            temp_all_words[word] = temp_all_words.get(word, 0) + 1

        # Update top_words.
        self.top_words = self.top_dict(
            temp_all_words,
            self.num_top_words
        )

        # Save all_words in database.
        self.all_words = temp_all_words

        return self.state


    @property
    def state(self):
        if self.submitted:
            total_count = sum(self.all_words.itervalues())
            return {
                'status': 'success',
                'submitted': True,
                'display_student_percents': (
                    self.display_student_percents in self.TRUTHY_VALUES
                ),
                'student_words': {
                    word: self.all_words[word] for word in self.student_words
                },
                'total_count': total_count,
                'top_words': self.prepare_words(self.top_words, total_count)
            }
        else:
            return {
                'status': 'success',
                'submitted': False,
                'display_student_percents': False,
                'student_words': {},
                'total_count': 0,
                'top_words': {}
            }


    def preprocess_word(self, word):
        """Convert raw word to suitable word."""
        return word.strip().lower()


    def prepare_words(self, top_words, total_count):
        """Convert words dictionary for client API.

        :param top_words: Top words dictionary
        :type top_words: dict
        :param total_count: Total number of words
        :type total_count: int

        :rtype: list of dicts. Every dict is 3 keys: text - actual word,
        size - counter of word, percent - percent in top_words dataset.

        Calculates corrected percents for every top word:

        For every word except last, it calculates rounded percent.
        For the last is 100 - sum of all other percents.

        """
        list_to_return = []
        percents = 0
        for num, word_tuple in enumerate(top_words.iteritems()):
            if num == len(top_words) - 1:
                percent = 100 - percents
            else:
                percent = round(100.0 * word_tuple[1] / total_count)
                percents += percent
            list_to_return.append(
                {
                    'text': word_tuple[0],
                    'size': word_tuple[1],
                    'percent': percent
                }
            )
        return list_to_return


    def top_dict(self, dict_obj, amount):
        """Return top words from all words, filtered by number of
        occurences

        :param dict_obj: all words
        :type dict_obj: dict
        :param amount: number of words to be in top dict
        :type amount: int
        :rtype: dict
        """
        return dict(
            sorted(
                dict_obj.items(),
                key=lambda x: x[1],
                reverse=True
            )[:amount]
        )


    @property
    def i18n_service(self):
        """ Obtains translation service """
        i18n_service = self.runtime.service(self, "i18n")
        if i18n_service:
            return i18n_service
        else:
            return DummyTranslationService()


    @staticmethod
    def workbench_scenarios():
        """A canned scenario for display in the workbench."""
        return [
            ("WordCloudXBlock",
             """<wordcloud/>
             """),
            ("Multiple WordCloudXBlock",
             """<vertical_demo>
                <wordcloud/>
                <wordcloud/>
                <wordcloud/>
                </vertical_demo>
             """),
        ]


def _(text):
    """ Dummy `gettext` replacement to make string extraction tools scrape strings marked for translation """
    return text


def ngettext_fallback(text_singular, text_plural, number):
    """ Dummy `ngettext` replacement to make string extraction tools scrape strings marked for translation """
    if number == 1:
        return text_singular
    else:
        return text_plural


class DummyTranslationService(object):
    """
    Dummy drop-in replacement for i18n XBlock service
    """
    gettext = _
    ngettext = ngettext_fallback
