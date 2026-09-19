"""The portrait must come from the photo area of the card (left side of an EU
card), not from a background pattern — checked on specimens where the photo
position is known."""
import pytest
from PIL import Image

import portrait

DIR = "/fixtures/documents/"
CARDS = [
    "driving_licences/germany_licence_wikipedia.jpg",
    "driving_licences/bulgaria_licence_bg5_recto_ec_europa.jpg",
    "driver_cards/germany_cpc_front_wikimedia.jpg",
]


@pytest.mark.parametrize("name", CARDS)
def test_portrait_is_cut_from_the_photo_area(name):
    card = Image.open(DIR + name).convert("RGB")
    photo = portrait.extract_portrait(card)
    assert photo is not None, "no portrait found"
    assert photo.height > photo.width, "an ID photo is taller than wide"
    assert photo.width < card.width * 0.6, "must not be the whole card"


def test_blurred_specimen_photo_gives_no_portrait():
    """The Italian specimen's photo is deliberately blurred out; better to
    return nothing than to crop some other part of the card."""
    card = Image.open(DIR + "driving_licences/italy_licence_wikipedia.jpg").convert("RGB")
    assert portrait.extract_portrait(card) is None
