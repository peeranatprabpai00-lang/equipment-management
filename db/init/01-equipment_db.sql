--
-- PostgreSQL database dump
--

\restrict lNtQhjVBJP5gbEnjdz1aig5qi0IDIlhKHrVAF1M3wwPPhmhYroXLIIfL002A1Yw

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: borrow_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.borrow_logs (
    id integer NOT NULL,
    equipment_id integer,
    borrower_name character varying(255) NOT NULL,
    borrow_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    return_date timestamp without time zone,
    status character varying(50) DEFAULT 'กำลังยืม'::character varying
);


--
-- Name: borrow_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.borrow_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: borrow_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.borrow_logs_id_seq OWNED BY public.borrow_logs.id;


--
-- Name: equipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipments (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100),
    status character varying(50) DEFAULT 'พร้อมใช้งาน'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    code character varying(100),
    brand character varying(100),
    department character varying(150),
    price numeric DEFAULT 0,
    serial_no character varying(100),
    location character varying(150),
    details text
);


--
-- Name: equipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipments_id_seq OWNED BY public.equipments.id;


--
-- Name: maintenance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_logs (
    id integer NOT NULL,
    equipment_id integer,
    issue_detail text NOT NULL,
    reported_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_date timestamp without time zone,
    cost numeric(10,2) DEFAULT 0.00,
    status character varying(50) DEFAULT 'กำลังซ่อม'::character varying
);


--
-- Name: maintenance_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maintenance_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maintenance_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maintenance_logs_id_seq OWNED BY public.maintenance_logs.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'admin'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    department character varying(100) DEFAULT 'สำนักงานส่วนกลาง'::character varying,
    full_name character varying(100) DEFAULT ''::character varying
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: borrow_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.borrow_logs ALTER COLUMN id SET DEFAULT nextval('public.borrow_logs_id_seq'::regclass);


--
-- Name: equipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipments ALTER COLUMN id SET DEFAULT nextval('public.equipments_id_seq'::regclass);


--
-- Name: maintenance_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs ALTER COLUMN id SET DEFAULT nextval('public.maintenance_logs_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: borrow_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.borrow_logs (id, equipment_id, borrower_name, borrow_date, return_date, status) FROM stdin;
\.


--
-- Data for Name: equipments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.equipments (id, name, category, status, created_at, code, brand, department, price, serial_no, location, details) FROM stdin;
1	MacBook Pro M2	IT	พร้อมใช้งาน	2026-11-12 14:40:14.546849	ITs001	Apple	ฝ่ายเทคโนโลยีสารสนเทศ	45900	C02G1234MD6R	ห้องบริการคอมพิวเตอร์ ชั้น 2	\N
2	โปรเจคเตอร์ Epson	Electronics	กำลังถูกยืม	2026-11-12 14:40:14.546849	ELs002	Epson	ฝ่ายบริการสารสนเทศ	29900	Q45K987652	ห้องประชุม 1 ชั้น 3	\N
3	เครื่องปริ้น	IT	ส่งซ่อม	2026-11-12 15:31:49.056618	ITs003	Canon	ฝ่ายบริหารทั่วไป	12900	CNB4M12900	งานธุรการและสารบรรณ ชั้น 1	\N
4	แอร์ HIER	เครื่องปรับอากาศ	พร้อมใช้งาน	2026-11-16 13:32:25.626243	AIRs004	Haier	สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร	38500	HR-24000-INV	ห้องอ่านหนังสือรวม ชั้น 2	\N
5	Dell OptiPlex 7020	คอมพิวเตอร์และอุปกรณ์	พร้อมใช้งาน	2026-11-17 13:37:36.253238	ITs005	Dell	ฝ่ายเทคโนโลยีสารสนเทศ	32500	DL7020-9981	ศูนย์เทคโนโลยีสารสนเทศ ชั้น 4	
\.


--
-- Data for Name: maintenance_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.maintenance_logs (id, equipment_id, issue_detail, reported_date, resolved_date, cost, status) FROM stdin;
1	3	ไฟไม่เข้า\n	2026-11-12 15:32:16.088867	\N	0.00	กำลังซ่อม
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password, role, created_at, department, full_name) FROM stdin;
1	admin	$2b$10$mDAR5/A0f.X9XNci9y3JGuMM94YEQhRmAWnuoDQYWKT0mOCslzPY2	admin	2026-11-12 15:24:54.995595	สำนักงานส่วนกลาง	
2	Box	$2b$10$YnkzurzOhub3oHhXSR9uVOllCHF3PuN9msbYVgJdQO1XEWPIQipNm	staff	2026-11-12 16:10:02.797478	ฝ่ายเทคโนโลยีสารสนเทศ	
5	M	$2b$10$ibaHxWzlzyog5OiMGXv0wOsza9wQZ0mJeZADga/1W9QGbyzl1M12u	technician	2026-11-16 13:43:54.735536	สำนักงานอธิการบดี ม.อ.	
\.


--
-- Name: borrow_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.borrow_logs_id_seq', 1, false);


--
-- Name: equipments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.equipments_id_seq', 5, true);


--
-- Name: maintenance_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.maintenance_logs_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: borrow_logs borrow_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.borrow_logs
    ADD CONSTRAINT borrow_logs_pkey PRIMARY KEY (id);


--
-- Name: equipments equipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipments
    ADD CONSTRAINT equipments_pkey PRIMARY KEY (id);


--
-- Name: maintenance_logs maintenance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: borrow_logs borrow_logs_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.borrow_logs
    ADD CONSTRAINT borrow_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipments(id) ON DELETE CASCADE;


--
-- Name: maintenance_logs maintenance_logs_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipments(id) ON DELETE CASCADE;

ALTER TABLE public.equipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.equipments ADD COLUMN IF NOT EXISTS updated_by VARCHAR(150);
ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS reporter_name VARCHAR(150);

CREATE TABLE IF NOT EXISTS public.equipment_edit_logs (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
  action VARCHAR(50) DEFAULT 'แก้ไขข้อมูล',
  modified_by VARCHAR(150) NOT NULL,
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  changes TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_equipment_edit_logs_eqid ON public.equipment_edit_logs(equipment_id);


--
-- PostgreSQL database dump complete
--

\unrestrict lNtQhjVBJP5gbEnjdz1aig5qi0IDIlhKHrVAF1M3wwPPhmhYroXLIIfL002A1Yw

