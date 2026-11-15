import unittest
from datetime import datetime

from app.redact import replace_text

ENTITY_TYPES = [
    "PHONE_NUMBER",
    "US_SSN",
    "PERSON",
    "EMAIL_ADDRESS",
    "CREDIT_CARD",
    "US_BANK_NUMBER",
    "IBAN_CODE",
    "DATE_OF_BIRTH",
    "IP_ADDRESS",
    "PASSWORD",
    "USERNAME",
]


def make_entity(id, entity_type, text="original"):
    return {
        "id": id,
        "entity_type": entity_type,
        "start": 0,
        "end": len(text),
        "score": 0.9,
        "text": text,
    }


def luhn_valid(number: str) -> bool:
    digits = [int(d) for d in number]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


class ReplaceTextTests(unittest.TestCase):
    def test_returns_value_for_every_id(self):
        entities = [make_entity(i, t) for i, t in enumerate(ENTITY_TYPES)]
        result = replace_text(entities)
        self.assertEqual(set(result), set(range(len(ENTITY_TYPES))))
        for value in result.values():
            self.assertIsInstance(value, str)
            self.assertTrue(value)

    def test_accepts_single_dict(self):
        result = replace_text(make_entity("abc", "PERSON"))
        self.assertEqual(list(result), ["abc"])

    def test_empty_list_returns_empty_dict(self):
        self.assertEqual(replace_text([]), {})

    def test_only_needs_id_type_and_text(self):
        result = replace_text({"id": 1, "entity_type": "USERNAME", "text": "bob"})
        self.assertIn(1, result)

    def test_value_differs_from_original_text(self):
        entities = [make_entity(i, t, text="ORIGINAL") for i, t in enumerate(ENTITY_TYPES)]
        for value in replace_text(entities).values():
            self.assertNotEqual(value, "ORIGINAL")

    def test_unknown_type_falls_back_to_redaction(self):
        result = replace_text(make_entity(0, "SOMETHING_ELSE", text="hello"))
        self.assertEqual(result[0], "[---]")

    def test_formats_match_entity_type(self):
        patterns = {
            "PHONE_NUMBER": r"\(\d{3}\) 555-\d{4}",
            "US_SSN": r"\d{3}-\d{2}-\d{4}",
            "PERSON": r"[A-Z][a-z]+ [A-Z][a-z]+",
            "EMAIL_ADDRESS": r"[a-z]+\d{3}@example\.(com|org|net)",
            "CREDIT_CARD": r"\d{4} \d{4} \d{4} \d{4}",
            "US_BANK_NUMBER": r"\d{8,12}",
            "IBAN_CODE": r"GB\d{2}XXXX\d{14}",
            "DATE_OF_BIRTH": r"\d{2}/\d{2}/\d{4}",
            "IP_ADDRESS": r"\d{1,3}(\.\d{1,3}){3}",
            "PASSWORD": r".{12}",
            "USERNAME": r"[a-z]+\d{3}",
        }
        # Run several times since values are random
        for _ in range(50):
            entities = [make_entity(t, t) for t in ENTITY_TYPES]
            result = replace_text(entities)
            for entity_type, pattern in patterns.items():
                with self.subTest(entity_type=entity_type):
                    self.assertRegex(result[entity_type], f"^{pattern}$")

    def test_credit_card_passes_luhn(self):
        for _ in range(50):
            card = replace_text(make_entity(0, "CREDIT_CARD"))[0]
            self.assertTrue(luhn_valid(card.replace(" ", "")), card)

    def test_ip_octets_in_range(self):
        for _ in range(50):
            ip = replace_text(make_entity(0, "IP_ADDRESS"))[0]
            for octet in ip.split("."):
                self.assertTrue(1 <= int(octet) <= 254, ip)

    def test_date_of_birth_is_real_date(self):
        for _ in range(50):
            dob = replace_text(make_entity(0, "DATE_OF_BIRTH"))[0]
            parsed = datetime.strptime(dob, "%m/%d/%Y")
            self.assertTrue(1950 <= parsed.year <= 2005, dob)


if __name__ == "__main__":
    unittest.main()
