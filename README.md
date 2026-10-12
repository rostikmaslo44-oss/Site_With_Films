# FilmVerse

## Запуск локально

1. Створи обліковий запис на [TMDB](https://www.themoviedb.org/) і згенеруй API Read Access Token у [налаштуваннях API](https://www.themoviedb.org/settings/api).
2. Скопіюй `.env.example` у `.env` і додай токен у `TMDB_ACCESS_TOKEN`. Файл `.env` не слід додавати до Git.
3. Встанови залежності та запусти Flask:

   ```powershell
   pip install -r requirements.txt
   python run.py
   ```

Сторінка отримує каталог і пошук з TMDB через сервер Flask; токен не передається браузеру.
