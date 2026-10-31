import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('smtp_sender', Path(__file__).resolve().parents[1] / 'vps/send_mail.py')
mail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mail)


class SMTPTest(unittest.TestCase):
    def test_tls_auth_recipient_and_plain_text(self):
        config = {'SMTP_HOST': 'smtp.example.com', 'SMTP_PORT': '587', 'SMTP_FROM': 'sender@example.com', 'SMTP_USER': 'sender@example.com', 'SMTP_PASSWORD_B64': 'c2VjcmV0'}
        payload = {'to': 'designer@example.com', 'text': '<script> literal customer text 👩🏽‍🎨', 'id': 'a'*36}
        client = MagicMock()
        client.send_message.return_value = {}
        with patch.object(mail.smtplib, 'SMTP', return_value=client):
            mail.send(config, payload)
        client.starttls.assert_called_once()
        client.login.assert_called_once_with('sender@example.com', 'secret')
        message = client.send_message.call_args.args[0]
        self.assertEqual(message['To'], 'designer@example.com')
        self.assertEqual(message.get_content_type(), 'text/plain')
        self.assertIn(payload['text'], message.get_content())
        for address in ['test@example.com\r\nBcc: other@example.com', 'name <a@example.com>', 'a@example.com,b@example.com']:
            with self.assertRaises(ValueError): mail.address(address)
        with self.assertRaises(ValueError): mail.send({**config, 'SMTP_PORT': '25'}, payload)
