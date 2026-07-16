-- Corte de tarifa adulto: decisión del cliente (2026-07-16) — la tarifa alta
-- ($2.789.000 por 40 clases) aplica desde los 16 años, no desde los 18.
-- Defensiva: solo corrige el valor por defecto sembrado (18); si el admin ya
-- lo editó a otra cosa, se respeta. Si la clave no existe aún, la crea el seed.
UPDATE system_config SET value = '16' WHERE key = 'tuition_adult_age' AND value = '18';
