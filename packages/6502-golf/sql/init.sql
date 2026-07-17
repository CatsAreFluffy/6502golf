CREATE TYPE challenge AS ENUM (
    'Count to 1000', 'Euler''s Number', 'Thue-Morse Sequence'
);

CREATE TABLE scores (
    challenge challenge NOT NULL,
    bytes int NOT NULL,
    cycles int NOT NULL,
    username varchar(39) NOT NULL
);