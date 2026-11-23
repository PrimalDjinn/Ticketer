INSERT INTO public."Company" (name)
VALUES ('Leizam-Ventures'),
       ('Kach-Ventures');

INSERT INTO public."Paybill" (number, "companyId")
VALUES (303303, 1),
       (733733, 1),
       (545545, 1),
       (801180, 1),
       (909090, 2);

INSERT INTO public."User" (user_id, name, "companyId", email, is_admin, password) VALUES
(2, 'Allan', 1, 'archiethebig@gmail.com', true, 'dev.nuxt.pass');